"""Active selection, atomic proposal reuse and concurrent request exclusion."""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from jobpulse_scraper.pipeline.company_proposals import ProposalStore, active_employers, research_batch, select_pending

EMPLOYER = {"id": 1, "name": "Synthetic One", "website": "https://example.invalid"}


def produce(names):
    return [{"name": n, "sector": "", "size": "", "offices": []} for n in names]


def run(root, producer=produce, employers=None, refresh=False):
    return research_batch(
        employers or [EMPLOYER],
        root,
        producer,
        provider="synthetic",
        model="fixture",
        provider_runs=[],
        refresh=refresh,
    )


def test_success_reused_unknowns_preserved_and_identity_changes(tmp_path):
    first = run(tmp_path)
    assert first["requested"] == 1
    assert first["results"][0]["unknown_fields"] == ["size", "offices"]
    assert run(tmp_path, lambda _: pytest.fail("Cached result must not call provider"))["cache_hits"] == 1
    assert run(tmp_path, employers=[{**EMPLOYER, "website": "https://other.invalid"}])["requested"] == 1
    store = ProposalStore(tmp_path)
    try:
        chosen, counts = select_pending([EMPLOYER, {"id": 2, "name": "Second"}], store, 1)
        assert chosen[0]["id"] == 2 and counts["cached_skipped"] == 1
        assert len(store.export()) == 2
    finally:
        store.close()


@pytest.mark.parametrize("bad", [[], [{"name": "Foreign"}], produce([EMPLOYER["name"]]) * 2])
def test_bad_batch_never_marked_success(tmp_path, bad):
    with pytest.raises(ValueError):
        run(tmp_path, lambda _: bad)
    store = ProposalStore(tmp_path)
    try:
        assert store.get(EMPLOYER) is None and store.deferred(EMPLOYER)
        assert select_pending([EMPLOYER], store, 1)[1]["deferred_skipped"] == 1
    finally:
        store.close()


def test_refresh_failure_preserves_success(tmp_path):
    run(tmp_path)
    with pytest.raises(ValueError):
        run(tmp_path, lambda _: [], refresh=True)
    assert run(tmp_path, lambda _: pytest.fail("Previous successful result survives"))["cache_hits"] == 1


def test_interruption_releases_lock_and_does_not_complete(tmp_path):
    def interrupt(_):
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        run(tmp_path, interrupt)
    assert run(tmp_path)["requested"] == 1


def test_concurrent_runs_only_request_once(tmp_path):
    calls = []

    def slow(names):
        calls.append(names)
        time.sleep(0.05)
        return produce(names)

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: run(tmp_path, slow), range(2)))
    assert len(calls) == 1
    assert sum(r["requested"] for r in results) == 1


def test_corrupt_cache_fails_before_api_request(tmp_path):
    run(tmp_path)
    store = ProposalStore(tmp_path)
    store.connection.execute("UPDATE proposals SET record=?", (json.dumps({}),))
    store.connection.commit()
    store.close()
    with pytest.raises(ValueError, match="checksum"):
        run(tmp_path, lambda _: pytest.fail("Corruption must not silently spend again"))


def test_active_selection_paginates_and_excludes_stale_or_unverified():
    cutoff = "2026-10-08T12:00:00+00:00"
    jobs = [
        {
            "id": 1,
            "employer_id": 1,
            "availability_status": "active",
            "availability_checked_at": "2026-10-09T11:00:00+00:00",
        },
        {
            "id": 2,
            "employer_id": 2,
            "availability_status": "unverified",
            "availability_checked_at": "2026-10-09T11:00:00+00:00",
        },
        {
            "id": 3,
            "employer_id": 3,
            "availability_status": "active",
            "availability_checked_at": "2026-10-07T11:00:00+00:00",
        },
        {
            "id": 4,
            "employer_id": 1,
            "availability_status": "active",
            "availability_checked_at": "2026-10-09T11:00:00+00:00",
        },
        {
            "id": 5,
            "employer_id": 4,
            "availability_status": "active",
            "availability_checked_at": "2026-10-09T11:00:00+00:00",
        },
    ]

    class Query:
        def __init__(self, table):
            self.rows = jobs.copy() if table == "jobs" else [{"id": i, "name": f"Synthetic {i}"} for i in range(1, 5)]

        def select(self, _):
            return self

        def eq(self, key, value):
            self.rows = [r for r in self.rows if r[key] == value]
            return self

        def gte(self, key, value):
            assert value == cutoff
            self.rows = [r for r in self.rows if r[key] >= value]
            return self

        def gt(self, key, value):
            self.rows = [r for r in self.rows if r[key] > value]
            return self

        def in_(self, key, values):
            self.rows = [r for r in self.rows if r[key] in values]
            return self

        def order(self, _):
            return self

        def limit(self, size):
            self.rows = self.rows[:size]
            return self

        def execute(self):
            return SimpleNamespace(data=self.rows)

    assert [
        e["id"]
        for e in active_employers(SimpleNamespace(table=Query), now=datetime(2026, 10, 9, 12, tzinfo=UTC), page_size=1)
    ] == [1, 4]


def test_batch_validation_is_atomic(tmp_path):
    second = {"id": 2, "name": "Synthetic Two"}
    with pytest.raises(ValueError):
        run(
            tmp_path,
            lambda names: [*produce(names[:1]), {"name": names[1], "sector": "", "size": "invented", "offices": []}],
            employers=[EMPLOYER, second],
        )
    store = ProposalStore(tmp_path)
    try:
        assert store.get(EMPLOYER) is None and store.get(second) is None
    finally:
        store.close()


def test_failed_deferral_expires_without_marking_completed(tmp_path, monkeypatch):
    import jobpulse_scraper.pipeline.company_proposals as module

    with pytest.raises(ValueError):
        run(tmp_path, lambda _: [])
    clock = time.time()
    monkeypatch.setattr(module.time, "time", lambda: clock + 21601)
    assert run(tmp_path)["requested"] == 1


def test_invalid_office_is_not_cached(tmp_path):
    proposal = produce([EMPLOYER["name"]])[0]
    proposal["offices"] = [
        {
            "name": "Synthetic",
            "address": "Synthetic Road",
            "city": "Synthetic",
            "country_code": "IE",
            "latitude": 0.0,
            "longitude": 0.0,
            "place_id": "synthetic",
        }
    ]
    with pytest.raises(ValueError, match="Ireland"):
        run(tmp_path, lambda _: [proposal])


def test_export_cli_uses_no_database_or_provider(tmp_path, monkeypatch):
    from tools import enrich_companies_ai

    run(tmp_path / "cache")
    report = tmp_path / "report.json"
    monkeypatch.setattr("sys.argv", ["ai", "--cache", str(tmp_path / "cache"), "--report", str(report), "--show-cache"])
    monkeypatch.setattr(enrich_companies_ai, "get_supabase", lambda: pytest.fail("Export must be offline"))
    monkeypatch.setattr(
        enrich_companies_ai, "enrich_companies_with_ai", lambda *args, **kwargs: pytest.fail("Export must not spend")
    )
    enrich_companies_ai.main()
    assert json.loads(report.read_text())["results"][0]["employer_id"] == 1
