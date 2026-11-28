"""A repair scan is finite, read-only by default, and guarded against concurrent links."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from tools import backfill_employers as backfill


class Query:
    def __init__(self, client):
        self.client = client
        self.cursor = None
        self.size = 500
        self.filters = []
        self.payload = None

    def select(self, *args):
        return self

    def order(self, name):
        assert name == "id"
        return self

    def limit(self, size):
        self.size = size
        return self

    def gt(self, name, cursor):
        self.cursor = cursor
        return self

    def eq(self, name, value):
        self.filters.append((name, value))
        return self

    def is_(self, name, value):
        self.filters.append((name, value))
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is not None:
            self.client.writes.append((self.payload, self.filters))
            if self.client.fail:
                raise RuntimeError("Synthetic update failure")
            return SimpleNamespace(data=[{"id": 501}])
        rows = [r for r in self.client.rows if self.cursor is None or r["id"] > self.cursor]
        return SimpleNamespace(data=rows[: self.size])


class Client:
    def __init__(self, rows, fail=False):
        self.rows = rows
        self.writes = []
        self.fail = fail

    def table(self, name):
        assert name == "jobs"  # No generation writes, and no candidate-table reads.
        return Query(self)


def setup(monkeypatch, client):
    service = MagicMock()
    service.resolve_employer.side_effect = lambda company, **kwargs: {"id": 17} if company else None
    monkeypatch.setattr(backfill, "get_supabase", lambda: client)
    monkeypatch.setattr(backfill, "EmployerLookupService", lambda client: service)
    sync = MagicMock()
    monkeypatch.setattr(backfill, "sync_watchlist_metadata", sync)
    return service, sync


def test_default_dry_run_passes_full_unresolved_page_without_writes(monkeypatch):
    client = Client([{"id": i, "company": ""} for i in range(500)] + [{"id": 501, "company": "Example"}])
    service, sync = setup(monkeypatch, client)
    counts = backfill.run_backfill()
    assert counts == {"scanned": 501, "proposed": 1, "updated": 0, "unresolved": 500, "failed": 0}
    assert not client.writes
    sync.assert_not_called()
    assert all(call.kwargs["persist"] is False for call in service.resolve_employer.call_args_list)


def test_limit_bounds_scanned_rows_even_when_nothing_resolves(monkeypatch):
    client = Client([{"id": i, "company": ""} for i in range(500)])
    setup(monkeypatch, client)
    assert backfill.run_backfill(limit=4)["scanned"] == 4
    with pytest.raises(ValueError):
        backfill.run_backfill(limit=0)


@pytest.mark.parametrize("fail", [False, True])
def test_apply_links_only_and_counts_actual_success(monkeypatch, fail):
    client = Client([{"id": 501, "company": "Example"}], fail=fail)
    setup(monkeypatch, client)
    counts = backfill.run_backfill(dry_run=False)
    assert counts["updated"] == (0 if fail else 1)
    assert counts["failed"] == (1 if fail else 0)
    assert client.writes == [({"employer_id": 17}, [("id", 501), ("company", "Example"), ("employer_id", "null")])]
