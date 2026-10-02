"""Operator geocoding credentials must never make unit tests contact production."""

import pytest


@pytest.fixture(autouse=True)
def isolate_geocoding_environment(monkeypatch):
    monkeypatch.delenv("GEOAPIFY_API_KEY", raising=False)
