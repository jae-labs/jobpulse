"""The supplied HTTP client enforces the database transport timeout."""

from unittest.mock import MagicMock

import httpx

from jobpulse_scraper.database import client


def test_supabase_custom_transport_uses_twenty_second_timeout(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://synthetic.invalid")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key")
    monkeypatch.setattr(client, "_supabase_client", None)
    create = MagicMock()
    monkeypatch.setattr(client, "create_client", create)

    client.get_supabase()

    options = create.call_args.kwargs["options"]
    transport = options.httpx_client
    try:
        assert isinstance(transport, httpx.Client)
        assert transport.timeout == httpx.Timeout(20)
        assert client.get_supabase() is create.return_value
        create.assert_called_once()
    finally:
        transport.close()
