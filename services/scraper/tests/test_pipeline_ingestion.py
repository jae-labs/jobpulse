"""The scraper orchestrator only runs vacancy ingestion."""

from unittest.mock import Mock

from pipeline import runner
from scrapers.generic.crawler import EmployerSyncResult, ScrapeOutcome


def test_synchronize_runs_ingestion_once(monkeypatch) -> None:
    scrape = Mock(return_value={"added": 4})
    monkeypatch.setattr(runner, "_scrape", scrape)
    assert runner.synchronize(employer="Example") == {"added": 4}
    scrape.assert_called_once_with("Example", None, True, False, False)


def test_targeted_watchlist_preserves_partial_counts_and_reports_incomplete(monkeypatch):
    monkeypatch.setattr(runner, "get_core_scrapers", lambda: [])
    monkeypatch.setattr(runner, "find_core_scraper_by_name", lambda name: None)
    monkeypatch.setattr(
        runner, "get_employers_tuples", lambda: [("Synthetic", "General", 50, "https://example.invalid")]
    )
    monkeypatch.setattr(
        runner,
        "sync_single_employer",
        lambda *args: EmployerSyncResult(
            added=2,
            opportunities_found=3,
            discovered_url="https://example.invalid",
            message="Incomplete",
            outcome=ScrapeOutcome.FAILED,
            detail="Synthetic failure",
            failed_writes=1,
            vectors_pending=2,
        ),
    )
    result = runner.synchronize(employer="Synthetic")
    assert result["status"] == "incomplete"
    assert result["persisted"] == 2 and result["failed_sources"] == 1
    assert result["failed_writes"] == 1 and result["vectors_pending"] == 2


def test_partial_source_failure_does_not_prune_catalog(monkeypatch) -> None:
    def unavailable():
        raise RuntimeError("synthetic source outage")

    monkeypatch.setattr(
        runner, "get_core_scrapers", lambda: [(unavailable, "Synthetic", "https://example.invalid", "test")]
    )
    monkeypatch.setattr(runner, "update_source_status", Mock())
    monkeypatch.setattr(runner, "update_employer_status", Mock())
    monkeypatch.setattr(runner, "log_scraper_event", Mock())
    monkeypatch.setattr(runner, "deduplicate_database_jobs", lambda: {})
    result = runner.synchronize(core_only=True)
    assert result["added"] == 0
    assert result["prune_stats"] == {}
    assert "existing results retained" in result["messages"][0]


def test_post_scrape_location_verification_is_bounded_and_preserves_ingestion(monkeypatch):
    from pipeline import job_locations

    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic-key")
    monkeypatch.setattr(runner, "_scrape", Mock(return_value={"added": 4}))
    verifier = Mock(return_value={"verified": 3})
    monkeypatch.setattr(job_locations, "verify_catalog_locations", verifier)
    assert runner.synchronize()["locations"] == {"verified": 3}
    verifier.assert_called_once_with(apply=True, limit=100)
    verifier.side_effect = RuntimeError("Synthetic provider failure")
    monkeypatch.setattr(runner, "log_scraper_event", Mock())
    result = runner.synchronize()
    assert result["added"] == 4 and result["locations"]["failed"] == 1


def test_synchronize_reloads_catalog_for_every_run(monkeypatch):
    from unittest.mock import Mock

    refresh = Mock()
    monkeypatch.setattr(runner, "clear_board_cache", refresh)
    monkeypatch.setattr(runner, "_scrape", lambda *args: {})
    monkeypatch.delenv("GEOAPIFY_API_KEY", raising=False)
    runner.synchronize()
    runner.synchronize()
    assert refresh.call_count == 2


def test_new_core_sources_propagate_request_failure(monkeypatch):
    import pytest

    from database.repository import IngestionIncompleteError
    from scrapers.core import fourdayweek, google, jobsireland, jobstash

    def unavailable(url):
        raise OSError("Listing unavailable")

    for module in (fourdayweek, google, jobsireland, jobstash):
        monkeypatch.setattr(module, "fetch_page", unavailable)
        status = Mock()
        monkeypatch.setattr(module, "update_source_status", status)
        with pytest.raises(IngestionIncompleteError):
            getattr(module, "sync_" + module.__name__.rsplit(".", 1)[-1])()
        assert status.call_args.args[1] == "Failed"
