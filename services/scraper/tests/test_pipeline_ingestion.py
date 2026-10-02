"""The scraper orchestrator only runs vacancy ingestion."""

from unittest.mock import Mock

from pipeline import runner


def test_synchronize_runs_ingestion_once(monkeypatch) -> None:
    scrape = Mock(return_value={"added": 4})
    monkeypatch.setattr(runner, "_scrape", scrape)
    assert runner.synchronize(employer="Example") == {"added": 4}
    scrape.assert_called_once_with("Example", None, True, False, False)


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
