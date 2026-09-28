"""The scraper's service-role API must protect candidate data."""

from http import HTTPStatus
from unittest.mock import Mock

from server import api


def test_profile_read_requires_authorization(monkeypatch) -> None:
    monkeypatch.setenv("JOBPULSE_API_TOKEN", "secret")
    monkeypatch.setattr(api, "get_supabase", Mock(side_effect=AssertionError("database must not be read")))
    handler = object.__new__(api.ApiHandler)
    handler.path = "/api/profile"
    handler.headers = {}
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
    handler.headers = {}
    handler.client_address = ("127.0.0.1", 12345)
    handler.send_json = Mock()

    handler.do_GET()

    assert handler.send_json.call_args.args[1] == HTTPStatus.BAD_REQUEST
    client.table.return_value.select.return_value.execute.assert_not_called()


def test_profile_read_requires_explicit_candidate(monkeypatch) -> None:
    monkeypatch.setattr(api, "get_supabase", Mock())
    load = Mock(side_effect=AssertionError("must not select an arbitrary candidate"))
    monkeypatch.setattr(api, "load_profile", load)
    monkeypatch.delenv("JOBPULSE_API_TOKEN", raising=False)
    handler = object.__new__(api.ApiHandler)
    handler.path = "/api/profile"
    handler.headers = {}
    handler.client_address = ("127.0.0.1", 12345)
    handler.send_json = Mock()
    handler.do_GET()
    handler.send_json.assert_called_once_with({"error": "A candidate user_id is required"}, HTTPStatus.BAD_REQUEST)
    load.assert_not_called()
