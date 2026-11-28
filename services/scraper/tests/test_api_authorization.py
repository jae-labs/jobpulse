"""The scraper's service-role API must protect candidate data."""

from http import HTTPStatus
from http.client import HTTPConnection, HTTPMessage
from http.server import ThreadingHTTPServer
from threading import Event, Thread
from unittest.mock import Mock

import pytest

from jobpulse_scraper.server import api


@pytest.fixture
def api_server(monkeypatch):
    """Exercise browser-shaped HTTP requests without database or scraper writes."""
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    monkeypatch.delenv("JOBPULSE_ALLOWED_ORIGIN", raising=False)
    sync = Mock(return_value={"synced": True})
    database = Mock()
    database.table.return_value.select.return_value.order.return_value.execute.return_value.data = []
    monkeypatch.setattr(api, "synchronize", sync)
    monkeypatch.setattr(api, "get_supabase", database)
    monkeypatch.setattr(api.ApiHandler, "log_message", lambda *args: None)
    server = ThreadingHTTPServer(("127.0.0.1", 0), api.ApiHandler)
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        yield server.server_address, sync, database
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def request_api(address, method, path, headers):
    connection = HTTPConnection(*address, timeout=2)
    try:
        connection.request(method, path, body="{}" if method == "POST" else None, headers=headers)
        response = connection.getresponse()
        response.read()
        return response.status, dict(response.getheaders())
    finally:
        connection.close()


def test_concurrent_sync_is_rejected_and_next_sync_can_run(api_server):
    address, sync, _ = api_server
    started, release = Event(), Event()

    def blocking_sync(**kwargs):
        started.set()
        assert release.wait(timeout=2)
        return {"synced": True}

    sync.side_effect = blocking_sync
    first = Thread(target=request_api, args=(address, "POST", "/api/sync", {}))
    first.start()
    try:
        assert started.wait(timeout=1)
        status, _ = request_api(address, "POST", "/api/sync", {})
        assert status == HTTPStatus.CONFLICT
        assert sync.call_count == 1
    finally:
        release.set()
        first.join(timeout=2)
    sync.side_effect = None
    status, _ = request_api(address, "POST", "/api/sync", {})
    assert status == HTTPStatus.OK
    assert sync.call_count == 2


@pytest.mark.parametrize("persisted,status", [(0, HTTPStatus.SERVICE_UNAVAILABLE), (2, HTTPStatus.MULTI_STATUS)])
def test_incomplete_ingestion_is_not_reported_as_success(api_server, persisted, status):
    address, sync, _ = api_server
    sync.return_value = {"status": "incomplete", "added": persisted, "failed_sources": 1}
    actual, _ = request_api(address, "POST", "/api/sync", {})
    assert actual == status


@pytest.mark.parametrize(
    "origin",
    [
        "https://attacker.ngrok-free.app",
        "https://attacker.example",
        "http://localhost:5173.attacker.example",
        "http://localhost:5174",
        "null",
        "",
    ],
)
@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/sync"),
        ("GET", "/api/sources"),
        ("POST", "/api/crawl/enqueue"),
        ("GET", "/api/crawl/runs"),
        ("GET", "/api/crawl/requests"),
    ],
)
def test_untrusted_loopback_browser_cannot_access_api(api_server, origin, method, path):
    address, sync, database = api_server
    status, headers = request_api(address, method, path, {"Origin": origin, "Content-Type": "text/plain"})
    assert status == HTTPStatus.UNAUTHORIZED
    assert "Access-Control-Allow-Origin" not in headers
    sync.assert_not_called()
    database.assert_not_called()


def test_untrusted_preflight_is_rejected(api_server):
    address, sync, database = api_server
    status, headers = request_api(
        address,
        "OPTIONS",
        "/api/sync",
        {"Origin": "https://attacker.ngrok-free.app", "Access-Control-Request-Method": "POST"},
    )
    assert status == HTTPStatus.FORBIDDEN
    assert "Access-Control-Allow-Origin" not in headers
    sync.assert_not_called()
    database.assert_not_called()


@pytest.mark.parametrize("origin", [None, "http://localhost:5173", "http://127.0.0.1:5173"])
def test_local_browser_and_cli_can_sync_without_token(api_server, origin):
    address, sync, _ = api_server
    status, headers = request_api(address, "POST", "/api/sync", {} if origin is None else {"Origin": origin})
    assert status == HTTPStatus.OK
    assert headers.get("Access-Control-Allow-Origin") == origin
    sync.assert_called_once_with(employer=None, limit=None, full=True)


@pytest.mark.parametrize("authorization", [None, "Bearer wrong", "secret", "Bearer secret"])
def test_configured_origin_requires_valid_bearer_token(api_server, monkeypatch, authorization):
    address, sync, _ = api_server
    monkeypatch.setenv("JOBPULSE_ALLOWED_ORIGIN", "https://dashboard.example")
    monkeypatch.setenv("JOBPULSE_API_TOKEN", "secret")
    headers = {"Origin": "https://dashboard.example"}
    if authorization is not None:
        headers["Authorization"] = authorization
    status, response_headers = request_api(address, "POST", "/api/sync", headers)
    assert response_headers["Access-Control-Allow-Origin"] == "https://dashboard.example"
    assert status == (HTTPStatus.OK if authorization == "Bearer secret" else HTTPStatus.UNAUTHORIZED)
    assert sync.call_count == (1 if authorization == "Bearer secret" else 0)


def test_configured_external_origin_cannot_use_loopback_bypass(api_server, monkeypatch):
    address, sync, _ = api_server
    monkeypatch.setenv("JOBPULSE_ALLOWED_ORIGIN", "https://dashboard.example")
    status, _ = request_api(address, "POST", "/api/sync", {"Origin": "https://dashboard.example"})
    assert status == HTTPStatus.UNAUTHORIZED
    sync.assert_not_called()


def test_valid_token_cannot_bypass_untrusted_origin(api_server, monkeypatch):
    address, sync, _ = api_server
    monkeypatch.setenv("JOBPULSE_API_TOKEN", "secret")
    status, _ = request_api(
        address, "POST", "/api/sync", {"Origin": "https://attacker.ngrok-free.app", "Authorization": "Bearer secret"}
    )
    assert status == HTTPStatus.UNAUTHORIZED
    sync.assert_not_called()


@pytest.mark.parametrize(
    "token,authorization,allowed", [("", "", False), ("secret", "", False), ("secret", "Bearer secret", True)]
)
def test_non_loopback_client_requires_token(monkeypatch, token, authorization, allowed):
    monkeypatch.setenv("JOBPULSE_API_TOKEN", token)
    handler = object.__new__(api.ApiHandler)
    handler.headers = HTTPMessage()
    handler.headers["Authorization"] = authorization
    handler.client_address = ("192.0.2.1", 12345)
    assert handler._authorized() is allowed


@pytest.mark.parametrize(
    "host,forwarded",
    [
        ("127.0.0.1:8000", {"X-Forwarded-For": "203.0.113.7"}),
        ("127.0.0.1:8000", {"Forwarded": "for=203.0.113.7"}),
        ("127.0.0.1:8000", {"X-Real-IP": "203.0.113.7"}),
        ("127.0.0.1:8000", {"X-Forwarded-Host": "attacker.ngrok-free.app"}),
        ("attacker.ngrok-free.app", {}),
        ("", {}),
    ],
)
def test_loopback_trust_is_revoked_behind_a_proxy(monkeypatch, host, forwarded):
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    handler = object.__new__(api.ApiHandler)
    handler.headers = HTTPMessage()
    if host:
        handler.headers["Host"] = host
    for name, value in forwarded.items():
        handler.headers[name] = value
    handler.client_address = ("127.0.0.1", 12345)
    assert handler._authorized() is False


def test_direct_loopback_without_proxy_headers_is_trusted(monkeypatch):
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    handler = object.__new__(api.ApiHandler)
    handler.headers = HTTPMessage()
    handler.headers["Host"] = "127.0.0.1:8000"
    handler.client_address = ("127.0.0.1", 12345)
    assert handler._authorized() is True


def test_forwarded_loopback_request_requires_token(api_server):
    address, _sync, database = api_server
    status, _ = request_api(address, "GET", "/api/sources", {"X-Forwarded-For": "203.0.113.7"})
    assert status == HTTPStatus.UNAUTHORIZED
    database.assert_not_called()


def test_profile_read_requires_authorization(monkeypatch) -> None:
    monkeypatch.setenv("JOBPULSE_API_TOKEN", "secret")
    monkeypatch.setattr(api, "get_supabase", Mock(side_effect=AssertionError("database must not be read")))
    handler = object.__new__(api.ApiHandler)
    handler.path = "/api/profile"
    handler.headers = HTTPMessage()
    handler.client_address = ("192.0.2.1", 12345)
    handler.send_json = Mock()

    handler.do_GET()

    handler.send_json.assert_called_once_with({"error": "Authorization required"}, HTTPStatus.UNAUTHORIZED)


def test_catalog_rejects_candidate_domain_filter(monkeypatch) -> None:
    client = Mock()
    monkeypatch.setattr(api, "get_supabase", lambda: client)
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    handler = object.__new__(api.ApiHandler)
    handler.path = "/api/jobs?domain=Engineering"
    handler.headers = HTTPMessage()
    handler.headers["Host"] = "127.0.0.1:8000"
    handler.client_address = ("127.0.0.1", 12345)
    handler.send_json = Mock()

    handler.do_GET()

    assert handler.send_json.call_args.args[1] == HTTPStatus.BAD_REQUEST
    client.table.return_value.select.return_value.execute.assert_not_called()


def test_profile_endpoint_is_not_available(monkeypatch) -> None:
    monkeypatch.setattr(api, "get_supabase", Mock())
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    handler = object.__new__(api.ApiHandler)
    handler.path = "/api/profile"
    handler.headers = HTTPMessage()
    handler.headers["Host"] = "127.0.0.1:8000"
    handler.client_address = ("127.0.0.1", 12345)
    handler.send_json = Mock()
    handler.do_GET()
    handler.send_json.assert_called_once_with({"error": "Not found"}, HTTPStatus.NOT_FOUND)


def test_catalog_rejects_candidate_status_filter(monkeypatch) -> None:
    client = Mock()
    monkeypatch.setattr(api, "get_supabase", lambda: client)
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    handler = object.__new__(api.ApiHandler)
    handler.path = "/api/jobs?status=applied"
    handler.headers = HTTPMessage()
    handler.headers["Host"] = "127.0.0.1:8000"
    handler.client_address = ("127.0.0.1", 12345)
    handler.send_json = Mock()
    handler.do_GET()
    assert handler.send_json.call_args.args[1] == HTTPStatus.BAD_REQUEST
    client.table.assert_not_called()
