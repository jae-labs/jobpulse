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
