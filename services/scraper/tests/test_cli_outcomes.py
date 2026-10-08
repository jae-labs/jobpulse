"""CLI safety, configuration and ingestion outcome contracts."""

from unittest.mock import Mock

import pytest

from jobpulse_scraper import app
from jobpulse_scraper.config.loader import load_websites_config


@pytest.fixture(autouse=True)
def isolate_automatic_reports(monkeypatch):
    monkeypatch.setattr(
        "jobpulse_scraper.runtime.reporting.save_crawl_report",
        Mock(return_value={"crawl_report": "synthetic-report.json"}),
    )


@pytest.mark.parametrize("failure", [False, True])
def test_worker_always_reports_and_preserves_failure_exit(monkeypatch, capsys, failure):
    from jobpulse_scraper.runtime import queue as runtime
    from jobpulse_scraper.runtime import reporting

    monkeypatch.setattr("sys.argv", ["scraper", "--worker", "--limit", "10"])
    monkeypatch.setattr(runtime, "CrawlQueue", Mock())
    monkeypatch.setattr(
        runtime, "run_worker", Mock(return_value={"complete": 1, "incomplete": int(failure), "lease_lost": 0})
    )
    report = Mock(return_value={"crawl_report": "synthetic-report.json"})
    monkeypatch.setattr(reporting, "save_crawl_report", report)
    if failure:
        with pytest.raises(SystemExit) as result:
            app.main()
        assert result.value.code == 1
    else:
        app.main()
    report.assert_called_once()
    assert "synthetic-report.json" in capsys.readouterr().out


def test_report_failure_is_visible_without_discarding_finished_tasks(monkeypatch, capsys):
    from jobpulse_scraper.runtime import queue as runtime
    from jobpulse_scraper.runtime import reporting

    monkeypatch.setattr("sys.argv", ["scraper", "--worker"])
    monkeypatch.setattr(runtime, "CrawlQueue", Mock())
    monkeypatch.setattr(runtime, "run_worker", Mock(return_value={"complete": 1, "incomplete": 0, "lease_lost": 0}))
    monkeypatch.setattr(reporting, "save_crawl_report", Mock(side_effect=OSError("synthetic private exception")))
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == 1
    output = capsys.readouterr()
    assert '"complete": 1' in output.out and "report_failed" in output.err
    assert "synthetic private exception" not in output.err


def test_retired_pruning_command_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    synchronize = Mock()
    metadata = Mock()
    monkeypatch.setattr("sys.argv", ["app.py", "--prune-only"])
    monkeypatch.setattr(app, "synchronize", synchronize)
    monkeypatch.setattr(app, "sync_watchlist_metadata", metadata)

    with pytest.raises(SystemExit) as exit_info:
        app.main()

    assert exit_info.value.code == 2
    synchronize.assert_not_called()
    metadata.assert_not_called()


@pytest.mark.parametrize("status,exit_code", [("complete", 0), ("incomplete", 1)])
def test_cli_exit_reports_ingestion_outcome(monkeypatch, capsys, status, exit_code):
    monkeypatch.setattr("sys.argv", ["scraper", "--core-only"])
    monkeypatch.setattr(app, "sync_watchlist_metadata", Mock())
    monkeypatch.setattr(app, "synchronize", Mock(return_value={"status": status, "added": 2}))
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == exit_code
    if exit_code:
        assert "failed sources require retry" in capsys.readouterr().out


def test_cli_summary_counts_structured_outcomes(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    """Unsupported and cooldown-skipped boards are not reported as opportunities."""
    monkeypatch.setattr("sys.argv", ["scraper", "--core-only"])
    monkeypatch.setattr(app, "sync_watchlist_metadata", Mock())
    monkeypatch.setattr(
        app,
        "synchronize",
        Mock(
            return_value={
                "status": "incomplete",
                "added": 4,
                "scraped_employers": 6,
                "failed_sources": 3,
                "outcomes": [
                    {"employer": "A", "outcome": "synced", "opportunities_found": 4, "persisted": 4},
                    {"employer": "B", "outcome": "empty"},
                    {"employer": "C", "outcome": "unsupported"},
                    {"employer": "D", "outcome": "blocked", "detail": "TCP blocked"},
                    {"employer": "E", "outcome": "failed", "detail": "read timed out"},
                ],
            }
        ),
    )
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == 1
    out = capsys.readouterr().out
    assert "Employers with opportunities: 1" in out
    assert "Employers with 0 found:    1" in out
    assert "Employers unsupported:     1" in out
    assert "Employers blocked / auth:  1" in out
    assert "Employers with errors:     1" in out
    assert "Employers skipped (cooldown): 1" in out
    assert "D: TCP blocked" in out and "E: read timed out" in out


def test_invalid_configuration_prints_issues_and_fails(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["scraper", "--validate-config"])
    monkeypatch.setattr(app, "load_websites_config", lambda: [])
    monkeypatch.setattr(app, "validate_websites_config", lambda _: ["Synthetic invalid source"])
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == 1
    assert "Synthetic invalid source" in capsys.readouterr().out


@pytest.mark.parametrize(
    "content",
    [
        "[",
        "{}",
        "[]",
        "websites: [broken]",
        "- name: Example\n  careers_url: https://example.invalid\n  enabled: 'false'",
        "- name: Example\n  careers_url: invalid",
    ],
)
def test_loader_rejects_malformed_configuration_without_empty_fallback(tmp_path, content):
    path = tmp_path / "websites.yaml"
    path.write_text(content)
    with pytest.raises(ValueError, match="Invalid source configuration"):
        load_websites_config(path)


def test_missing_configuration_cannot_fall_back_to_a_different_file(tmp_path):
    with pytest.raises(ValueError, match="Invalid source configuration"):
        load_websites_config(tmp_path / "missing.yaml")


def test_valid_configuration_retains_disabled_sources_and_defaults(tmp_path):
    path = tmp_path / "websites.yaml"
    path.write_text("- name: Example\n  careers_url: https://example.invalid\n  enabled: false")
    sources = load_websites_config(path)
    assert sources[0]["enabled"] is False and sources[0]["priority"] == 50


@pytest.mark.parametrize("queued", [0, 3])
def test_auto_start_uses_atomic_source_eligibility_and_then_drains(monkeypatch, capsys, queued):
    from jobpulse_scraper.runtime import queue as runtime

    queue = Mock(spec=runtime.CrawlQueue)
    enqueue = Mock(return_value=queued)
    worker = Mock(return_value={"complete": 2, "incomplete": 0, "lease_lost": 0})
    monkeypatch.setattr("sys.argv", ["scraper", "--auto", "--limit", "100"])
    monkeypatch.setattr(runtime, "CrawlQueue", lambda: queue)
    monkeypatch.setattr(runtime, "enqueue_configured", enqueue)
    monkeypatch.setattr(runtime, "run_worker", worker)
    synchronize = Mock()
    monkeypatch.setattr(app, "synchronize", synchronize)
    app.main()
    enqueue.assert_called_once_with(queue, only_if_idle=True)
    worker.assert_called_once_with(queue, max_tasks=100, concurrency=4, task_timeout=120)
    synchronize.assert_not_called()
    assert f'"queued": {queued}' in capsys.readouterr().out


def test_explicit_worker_never_seeds_even_with_make_auto_flag(monkeypatch):
    from jobpulse_scraper.runtime import queue as runtime

    enqueue = Mock()
    worker = Mock(return_value={"complete": 0, "incomplete": 0, "lease_lost": 0})
    monkeypatch.setattr("sys.argv", ["scraper", "--auto", "--worker"])
    monkeypatch.setattr(runtime, "CrawlQueue", Mock())
    monkeypatch.setattr(runtime, "enqueue_configured", enqueue)
    monkeypatch.setattr(runtime, "run_worker", worker)
    app.main()
    enqueue.assert_not_called()
    worker.assert_called_once()


def test_invalid_auto_worker_bound_is_rejected_before_enqueuing(monkeypatch):
    from jobpulse_scraper.runtime import queue as runtime

    enqueue = Mock()
    monkeypatch.setattr("sys.argv", ["scraper", "--auto", "--limit", "10001"])
    monkeypatch.setattr(runtime, "enqueue_configured", enqueue)
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == 2
    enqueue.assert_not_called()


def test_auto_start_defaults_to_the_supported_maximum(monkeypatch):
    from jobpulse_scraper.runtime import queue as runtime

    queue = Mock(spec=runtime.CrawlQueue)
    worker = Mock(return_value={"complete": 0, "incomplete": 0, "lease_lost": 0})
    monkeypatch.setattr("sys.argv", ["scraper", "--auto"])
    monkeypatch.setattr(runtime, "CrawlQueue", lambda: queue)
    monkeypatch.setattr(runtime, "enqueue_configured", Mock(return_value=0))
    monkeypatch.setattr(runtime, "run_worker", worker)
    app.main()
    worker.assert_called_once_with(queue, max_tasks=10_000, concurrency=4, task_timeout=120)
