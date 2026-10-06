"""Database board catalog: identity detection, loader fallback, and seed import."""

from __future__ import annotations

import config.boards as boards
from config import loader


def test_detect_provider_identifies_supported_ats() -> None:
    assert boards.detect_provider("https://job-boards.greenhouse.io/acme") == ("greenhouse", "acme")
    assert boards.detect_provider("https://jobs.lever.co/acme") == ("lever", "acme")
    assert boards.detect_provider("https://jobs.ashbyhq.com/acme") == ("ashby", "acme")
    assert boards.detect_provider("https://careers.smartrecruiters.com/Version1") == ("smartrecruiters", "Version1")
    assert boards.detect_provider("https://apply.workable.com/acme") == ("workable", "acme")
    assert boards.detect_provider("https://acme.bamboohr.com/jobs") == ("bamboohr", "acme")
    assert boards.detect_provider("https://acme.jobs.personio.de") == ("personio", "acme")
    assert boards.detect_provider("https://acme.recruitee.com") == ("recruitee", "acme")


def test_detect_provider_keeps_workday_tenant_and_site() -> None:
    assert boards.detect_provider("https://acme.wd1.myworkdayjobs.com/en-US/External") == (
        "workday",
        "acme.wd1.myworkdayjobs.com/External",
    )


def test_detect_provider_falls_back_to_generic_host_path() -> None:
    provider, board = boards.detect_provider("https://www.example.com/careers")
    assert provider == "generic"
    assert board == "www.example.com/careers"


def test_detect_provider_identifies_new_adapters() -> None:
    assert boards.detect_provider("https://acme.breezy.hr") == ("breezy", "acme")
    assert boards.detect_provider("https://codec.pinpointhq.com/en/postings/abc") == ("pinpoint", "codec")
    assert boards.detect_provider("https://ats.rippling.com/acme/jobs/1") == ("rippling", "acme")
    ukg_board = "recruiting2.ultipro.com/acme/JobBoard/3347ce03-ba60-4bdc-8af2-26369c80b18f"
    assert boards.detect_provider(f"https://{ukg_board}/OpportunityDetail?opportunityId=x") == ("ukg", ukg_board)
    assert boards.board_url("breezy", "acme") == "https://acme.breezy.hr"
    assert boards.board_url("pinpoint", "codec") == "https://codec.pinpointhq.com"
    assert boards.board_url("rippling", "acme") == "https://ats.rippling.com/acme/jobs"
    assert boards.board_url("ukg", ukg_board) == f"https://{ukg_board}"


def test_detect_provider_identifies_hard_providers() -> None:
    assert boards.detect_provider("https://careers-sisk.icims.com/jobs/1/engineer/job") == (
        "icims",
        "careers-sisk.icims.com",
    )
    assert boards.detect_provider("https://paypal.eightfold.ai/careers/job/1") == (
        "eightfold",
        "paypal.eightfold.ai",
    )
    assert boards.board_url("icims", "careers-sisk.icims.com") == "https://careers-sisk.icims.com"
    assert boards.board_url("eightfold", "paypal.eightfold.ai") == "https://paypal.eightfold.ai"


def test_match_board_employers_normalizes_and_uses_aliases() -> None:
    from tools import backfill_board_employers as bbe

    boards_rows = [
        {"id": 1, "company": "Deloitte", "employer_id": None},
        {"id": 2, "company": "Glanua Group Limited", "employer_id": None},
        {"id": 3, "company": "Unknown Co", "employer_id": None},
    ]
    employers = [
        {"id": 10, "name": "Deloitte Ireland"},
        {"id": 11, "name": "Glanua"},
        {"id": 12, "name": "Other"},
    ]
    pairs = dict(bbe.match_board_employers(boards_rows, employers))
    assert pairs.get(1) == 10  # normalized/curated: Deloitte -> Deloitte Ireland
    assert pairs.get(2) == 11  # curated alias: Glanua Group Limited -> Glanua
    assert 3 not in pairs


def test_match_board_employers_skips_ambiguous_normalized() -> None:
    from tools import backfill_board_employers as bbe

    rows = [{"id": 1, "company": "Foo Ireland", "employer_id": None}]
    employers = [{"id": 10, "name": "Foo"}, {"id": 11, "name": "Foo Limited"}]
    assert bbe.match_board_employers(rows, employers) == []


def test_backfill_create_links_new_employers(monkeypatch) -> None:
    from tools import backfill_board_employers as bbe

    updates: list[tuple[dict, int]] = []

    class _Query:
        def update(self, payload):
            self._payload = payload
            return self

        def eq(self, _column, value):
            updates.append((self._payload, value))
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    class _Client:
        def table(self, _name):
            return _Query()

    def fake_select_all(_client, table, _columns):
        if table == "employers":
            return [{"id": 1, "name": "Existing Co"}]
        return [
            {"id": 10, "company": "Existing Co", "employer_id": None, "careers_url": "", "status": "active"},
            {"id": 11, "company": "Brand New Co", "employer_id": None, "careers_url": "", "status": "pending"},
        ]

    class _Service:
        def __init__(self, _client=None):
            pass

        def resolve_employer(self, name, careers_url="", persist=True):
            return {"id": 99, "name": name}

    monkeypatch.setattr(bbe, "get_supabase", lambda: _Client())
    monkeypatch.setattr(bbe, "_select_all", fake_select_all)
    monkeypatch.setattr(bbe, "EmployerLookupService", _Service)

    counts = bbe.backfill_board_employers(apply=True, create=True)
    assert counts["to_create"] == 1
    assert counts["updated"] == 2
    linked = {value: payload["employer_id"] for payload, value in updates}
    assert linked == {10: 1, 11: 99}


def _db_row() -> dict:
    return {
        "id": 1,
        "provider": "greenhouse",
        "board": "acme",
        "region": "",
        "company": "Acme",
        "careers_url": "https://job-boards.greenhouse.io/acme",
        "sector": "Tech",
        "priority": 90,
        "enabled": True,
        "status": "active",
    }


def test_loader_prefers_database_catalog(monkeypatch) -> None:
    boards.clear_board_cache()
    monkeypatch.setattr(boards, "_all_targets", lambda: [_db_row()])
    monkeypatch.setattr(
        loader,
        "load_websites_config",
        lambda: [{"name": "YAML", "sector": "s", "priority": 1, "careers_url": "https://yaml.invalid"}],
    )
    assert loader.get_employers_tuples() == [("Acme", "Tech", 90, "https://job-boards.greenhouse.io/acme")]
    boards.clear_board_cache()


def test_loader_falls_back_to_yaml_when_catalog_unavailable(monkeypatch) -> None:
    boards.clear_board_cache()
    monkeypatch.setattr(boards, "_all_targets", lambda: None)
    monkeypatch.setattr(
        loader,
        "load_websites_config",
        lambda: [
            {
                "name": "Acme",
                "sector": "Tech",
                "priority": 50,
                "careers_url": "https://job-boards.greenhouse.io/acme",
                "enabled": True,
            }
        ],
    )
    assert loader.get_employers_tuples() == [("Acme", "Tech", 50, "https://job-boards.greenhouse.io/acme")]


def test_loader_filters_disabled_catalog_rows(monkeypatch) -> None:
    boards.clear_board_cache()
    enabled = {**_db_row(), "id": 2, "board": "beta", "company": "Beta", "enabled": True}
    disabled = {**_db_row(), "id": 3, "board": "gamma", "company": "Gamma", "enabled": False}
    monkeypatch.setattr(boards, "_all_targets", lambda: [enabled, disabled])
    assert loader.get_employers_tuples(enabled_only=True) == [
        ("Beta", "Tech", 90, "https://job-boards.greenhouse.io/acme")
    ]
    boards.clear_board_cache()


def test_import_build_payloads_dedupes_and_detects(monkeypatch) -> None:
    from tools import import_boards

    monkeypatch.setattr(
        import_boards,
        "_seed_entries",
        lambda _path: [
            {"name": "Seed Co", "sector": "Tech", "priority": 80, "careers_url": "https://jobs.lever.co/seedco"}
        ],
    )
    monkeypatch.setattr(
        import_boards,
        "load_websites_config",
        lambda: [
            {
                "name": "Green Co",
                "sector": "Tech",
                "priority": 70,
                "careers_url": "https://job-boards.greenhouse.io/greenco",
                "enabled": True,
            },
            {
                "name": "Dup Co",
                "sector": "Tech",
                "priority": 60,
                "careers_url": "https://jobs.lever.co/seedco",
                "enabled": True,
            },
        ],
    )
    payloads = {(item["provider"], item["board"].lower()): item for item in import_boards.build_payloads()}
    assert len(payloads) == 2
    assert payloads[("greenhouse", "greenco")]["status"] == "active"
    # The watchlist row for the same Lever board overrides the pending seed.
    assert payloads[("lever", "seedco")]["discovery_source"] == "config"
    assert payloads[("lever", "seedco")]["status"] == "active"


def test_sniff_apply_updates_catalog_identity() -> None:
    from types import SimpleNamespace

    from tools import sniff_ats

    calls: dict = {}

    class _Query:
        def update(self, payload):
            calls["payload"] = payload
            return self

        def eq(self, column, value):
            calls["eq"] = (column, value)
            return self

        def in_(self, column, values):
            calls["in_"] = (column, values)
            return self

        def execute(self):
            return SimpleNamespace(data=[{"id": 7}])

    client = SimpleNamespace(table=lambda name: (calls.setdefault("table", name), _Query())[1])
    resolved = [
        {"name": "Acme", "ats_url": "https://job-boards.greenhouse.io/acme", "job_count": 3},
        {"name": "Empty", "ats_url": "https://jobs.lever.co/empty", "job_count": 0},
    ]
    assert sniff_ats.apply_resolved_boards(resolved, client=client) == 1
    assert calls["payload"]["provider"] == "greenhouse"
    assert calls["payload"]["board"] == "acme"
    assert calls["eq"] == ("company", "Acme")
    assert calls["in_"] == ("status", ["pending", "active"])


def test_board_url_builds_canonical_links() -> None:
    assert boards.board_url("greenhouse", "acme") == "https://job-boards.greenhouse.io/acme"
    assert boards.board_url("lever", "acme") == "https://jobs.lever.co/acme"
    assert boards.board_url("bamboohr", "acme") == "https://acme.bamboohr.com/jobs"
    assert (
        boards.board_url("workday", "acme.wd1.myworkdayjobs.com/External")
        == "https://acme.wd1.myworkdayjobs.com/External"
    )
    assert boards.board_url("generic", "www.example.com/careers") is None
    assert boards.board_url("greenhouse", "") is None


def test_catalog_entry_for_company(monkeypatch) -> None:
    boards.clear_board_cache()
    monkeypatch.setattr(boards, "_all_targets", lambda: [_db_row()])
    entry = boards.catalog_entry_for("Acme")
    assert entry is not None and entry["provider"] == "greenhouse" and entry["board"] == "acme"
    assert boards.catalog_entry_for("Missing") is None
    boards.clear_board_cache()


def test_catalog_entry_for_url_disambiguates_duplicate_names(monkeypatch) -> None:
    boards.clear_board_cache()
    monkeypatch.setattr(
        boards,
        "_all_targets",
        lambda: [
            {
                "id": 1,
                "provider": "greenhouse",
                "board": "miro",
                "region": "",
                "company": "Miro",
                "careers_url": "https://job-boards.greenhouse.io/miro",
                "sector": "Tech",
                "priority": 40,
                "enabled": True,
                "status": "active",
            },
            {
                "id": 2,
                "provider": "ashby",
                "board": "miro",
                "region": "",
                "company": "Miro",
                "careers_url": "https://jobs.ashbyhq.com/miro",
                "sector": "Tech",
                "priority": 40,
                "enabled": True,
                "status": "active",
            },
        ],
    )
    entry = boards.catalog_entry_for("Miro")
    assert entry is not None and entry["board_id"] == 1
    url_entry = boards.catalog_entry_for_url("https://jobs.ashbyhq.com/miro")
    assert url_entry is not None and url_entry["board_id"] == 2
    trailing = boards.catalog_entry_for_url("https://jobs.ashbyhq.com/miro/")
    assert trailing is not None and trailing["board_id"] == 2
    boards.clear_board_cache()


def test_listing_prefers_catalog_provider(monkeypatch) -> None:
    from scrapers.generic import listing

    sentinel = [{"url": "https://boards.greenhouse.io/acme/jobs/1", "title": "Role"}]
    monkeypatch.setattr(listing, "extract_greenhouse_opportunities", lambda n, u, h: sentinel)
    result = listing.extract_jobs_from_listing(
        "Acme", "https://job-boards.greenhouse.io/acme", "", provider="greenhouse"
    )
    assert result == sentinel


def test_match_board_employers() -> None:
    from tools import backfill_board_employers as bbe

    boards_rows = [
        {"id": 1, "company": "Acme", "employer_id": None},
        {"id": 2, "company": "Globex", "employer_id": None},
        {"id": 3, "company": "Acme", "employer_id": 9},
    ]
    employers = [{"id": 9, "name": "acme"}, {"id": 10, "name": "Initech"}]
    assert bbe.match_board_employers(boards_rows, employers) == [(1, 9)]


def test_is_cooled_down() -> None:
    from datetime import UTC, datetime, timedelta

    now = datetime(2026, 10, 6, tzinfo=UTC)
    assert boards.is_cooled_down({"cooldown_until": (now + timedelta(hours=1)).isoformat()}, now=now)
    assert not boards.is_cooled_down({"cooldown_until": (now - timedelta(hours=1)).isoformat()}, now=now)
    assert not boards.is_cooled_down({"cooldown_until": None}, now=now)
    assert not boards.is_cooled_down(None, now=now)


def test_cooled_down_companies(monkeypatch) -> None:
    from datetime import UTC, datetime, timedelta

    boards.clear_board_cache()
    future = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    monkeypatch.setattr(
        boards,
        "_all_targets",
        lambda: [
            {**_db_row(), "cooldown_until": future},
            {**_db_row(), "id": 2, "company": "Beta", "board": "beta", "cooldown_until": None},
        ],
    )
    assert boards.cooled_down_companies() == ["Acme"]
    boards.clear_board_cache()


def test_record_board_outcome_payload() -> None:
    from database.board_health import record_board_outcome

    captured: dict = {}

    class _Query:
        def rpc(self, name, payload):
            captured["name"] = name
            captured["payload"] = payload
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    record_board_outcome(_Query(), 7, success=False, ingested=0, error="boom")
    assert captured["name"] == "record_board_outcome"
    assert captured["payload"] == {
        "p_board_id": 7,
        "p_success": False,
        "p_ingested": 0,
        "p_error": "boom",
        "p_found": None,
    }


def test_watchlist_skips_cooled_boards(monkeypatch) -> None:
    from scrapers.generic import crawler

    called: list[str] = []

    def fake_sync(name, careers_url, sector, priority):
        called.append(careers_url)
        return crawler.EmployerSyncResult(
            added=1,
            opportunities_found=1,
            discovered_url=careers_url,
            message="ok",
            outcome=crawler.ScrapeOutcome.SYNCED,
            detail="",
        )

    from datetime import UTC, datetime, timedelta

    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    monkeypatch.setattr(
        crawler,
        "catalog_entry_for_url",
        lambda url: {"cooldown_until": future} if url == "https://x" else None,
    )
    monkeypatch.setattr(crawler, "sync_single_employer", fake_sync)
    total, results = crawler.sync_watchlist_employers(
        [("Same Co", "General", 50, "https://x"), ("Same Co", "General", 50, "https://y")],
        max_workers=1,
    )
    assert called == ["https://y"]
    assert total == 1 and len(results) == 1


def test_disabled_catalog_does_not_resurrect_yaml(monkeypatch):
    from config import loader

    boards.clear_board_cache()
    monkeypatch.setattr(boards, "_fetch_all_targets", lambda: [{**_db_row(), "enabled": False}])
    monkeypatch.setattr(loader, "load_websites_config", lambda: (_ for _ in ()).throw(AssertionError("YAML fallback")))
    assert loader.get_employers_tuples(enabled_only=True) == []
    boards.clear_board_cache()


def test_catalog_indexes_are_built_once_and_reload_health(monkeypatch):
    boards.clear_board_cache()
    rows = [{**_db_row(), "cooldown_until": None}]
    monkeypatch.setattr(boards, "_fetch_all_targets", lambda: rows)
    from unittest.mock import Mock

    mapper = Mock(wraps=boards._row_to_target)
    monkeypatch.setattr(boards, "_row_to_target", mapper)
    for _ in range(4):
        assert boards.catalog_entry_for("Acme") is not None
        assert boards.catalog_entry_for_url(rows[0]["careers_url"]) is not None
    assert mapper.call_count == 1
    rows = [{**rows[0], "cooldown_until": "2099-01-01T00:00:00+00:00"}]
    boards.clear_board_cache()
    assert boards.is_cooled_down(boards.catalog_entry_for("Acme"))
    boards.clear_board_cache()


def test_empty_api_board_is_success_and_api_failure_is_not(monkeypatch):
    from unittest.mock import Mock

    from scrapers.generic import crawler, listing

    monkeypatch.setattr(crawler, "catalog_entry_for_url", lambda _: {"provider": "greenhouse", "board": "acme"})
    monkeypatch.setattr(crawler, "update_source_status", Mock())
    monkeypatch.setattr(crawler, "update_employer_status", Mock())
    monkeypatch.setattr(crawler, "log_scraper_event", Mock())
    monkeypatch.setattr(listing, "extract_greenhouse_opportunities", lambda *args: [])
    result = crawler._crawl_employer("Acme", "https://vanity.example.invalid")
    assert result.outcome == crawler.ScrapeOutcome.EMPTY

    def unavailable(*args):
        raise OSError("Listing unavailable")

    monkeypatch.setattr(listing, "extract_greenhouse_opportunities", unavailable)
    result = crawler._crawl_employer("Acme", "https://vanity.example.invalid")
    assert result.outcome == crawler.ScrapeOutcome.FAILED
