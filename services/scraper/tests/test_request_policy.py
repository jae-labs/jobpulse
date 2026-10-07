"""Pacing, denial persistence and server-directed cooldown regressions."""

import json
from email.message import Message
from unittest.mock import MagicMock
from urllib.error import HTTPError
from urllib.request import Request

import pytest

from network import http_client, request_policy


@pytest.fixture(autouse=True)
def isolated_gate(monkeypatch, tmp_path):
    monkeypatch.setattr(request_policy, "STATE_PATH", tmp_path / "cooldowns.json")
    monkeypatch.setattr(request_policy.gate, "last_started", {})


@pytest.mark.parametrize(
    "value,expected", [("120", 120), ("-2", 0), ("bad", 0), (None, 0), ("Thu, 01 Jan 1970 00:02:00 GMT", 120)]
)
def test_retry_after(value, expected):
    assert request_policy.retry_after_seconds(value, now=0) == expected


def test_host_pacing_covers_different_paths(monkeypatch):
    sleeps = []
    monkeypatch.setattr(request_policy.time, "monotonic", lambda: 100)
    monkeypatch.setattr(request_policy.time, "sleep", sleeps.append)
    request_policy.gate.wait("https://example.invalid/a")
    request_policy.gate.wait("https://example.invalid/b")
    request_policy.gate.wait("https://other.invalid/a")
    assert sleeps == [3]


@pytest.mark.parametrize("status", [401, 403, 429, 503])
def test_denial_stops_http_and_later_paths_without_request(monkeypatch, status):
    headers = Message()
    headers["Retry-After"] = "3600"
    error = HTTPError("https://example.invalid/a", status, "stop", headers, None)
    fetch = MagicMock(side_effect=error)
    monkeypatch.setattr(http_client, "_stdlib_urlopen", fetch)
    with pytest.raises(HTTPError) as caught:
        http_client.fetch_page("https://example.invalid/a")
    assert caught.value is error
    with pytest.raises(request_policy.HostCoolingDown):
        with http_client.open_request(Request("https://example.invalid/b")):
            pass
    assert fetch.call_count == 1
    state = json.loads(request_policy.STATE_PATH.read_text())
    assert state["example.invalid"] >= request_policy.time.time() + 3590
    # A fresh process still sees the saved cooldown.
    with pytest.raises(request_policy.HostCoolingDown):
        request_policy.RequestGate().wait("https://example.invalid/c")


def test_cooldown_blocks_browser_fallback(monkeypatch):
    from network import browser

    request_policy.gate.observe("https://example.invalid/a", 403, None)
    launch = MagicMock()
    monkeypatch.setattr(browser, "with_browser", launch)
    with pytest.raises(request_policy.HostCoolingDown):
        browser.fetch_via_browser("https://example.invalid/b")
    launch.assert_not_called()


def test_invalid_policy_fails_closed(tmp_path):
    path = tmp_path / "policy.yaml"
    path.write_text("defaults: {min_interval_seconds: .nan, block_cooldown_seconds: 900}\nhosts: {}")
    with pytest.raises(ValueError):
        request_policy.load_policy(path)


def test_expired_cooldown_allows_request(monkeypatch):
    request_policy.STATE_PATH.write_text('{"example.invalid": 1}')
    request_policy.gate.check("https://example.invalid/a")


def test_consumer_http_error_does_not_repeat_request(monkeypatch):
    response = MagicMock(status=200)
    response.headers.get.return_value = None
    fetch = MagicMock(return_value=response)
    monkeypatch.setattr(http_client, "_stdlib_urlopen", fetch)
    failure = HTTPError("https://example.invalid", 500, "consumer failure", Message(), None)
    with pytest.raises(HTTPError) as caught:
        with http_client.open_request(Request("https://example.invalid")):
            raise failure
    assert caught.value is failure
    fetch.assert_called_once()
    response.close.assert_called_once()
