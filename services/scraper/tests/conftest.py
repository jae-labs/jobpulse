"""Operator geocoding credentials must never make unit tests contact production."""

import pytest


@pytest.fixture(autouse=True)
def isolate_geocoding_environment(monkeypatch):
    monkeypatch.delenv("GEOAPIFY_API_KEY", raising=False)


@pytest.fixture(autouse=True)
def isolate_http_cooldown_state(tmp_path, monkeypatch):
    """Keep the durable host-cooldown ledger out of the developer checkout.

    The request gate persists 401/403/429/503 cooldowns to ``.backups/``. Without
    isolation, one test that mocks a blocked response poisons the developer's real
    state file and makes later runs fail with a spurious local cooldown.
    """
    from network import request_policy

    monkeypatch.setattr(request_policy, "STATE_PATH", tmp_path / "http-cooldowns.json")
    request_policy.gate.last_started.clear()
    yield
    request_policy.gate.last_started.clear()
