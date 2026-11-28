"""Source measurements, learning and comparisons preserve evidence across runs."""

import json
from unittest.mock import Mock

import pytest

from jobpulse_scraper.network import experience
from jobpulse_scraper.network.ledger import source_key
from jobpulse_scraper.network.request_policy import gate
from jobpulse_scraper.runtime.reporting import summarize_runs
from jobpulse_scraper.scrapers.generic import crawler


def test_run_counts_attempts_denials_quality_and_private_safe_logs(monkeypatch, capsys):
    monkeypatch.setattr(experience.time, "time", lambda: 1000)
    token = experience.run_key.set("synthetic-run")
    source = source_key.set("synthetic-source")
    try:
        experience.event("request_sent", "secret:password@synthetic.invalid")
        experience.event("response_received", "synthetic.invalid", status=200)
        experience.event("request_sent", "synthetic.invalid", transport="browser", resource="xhr")
        experience.event(
            "response_received", "synthetic.invalid", transport="browser", status=429, data={"retry_after_seconds": 120}
        )
        experience.event("cooldown_skipped", "synthetic.invalid")
        experience.measure_quality(
            [
                {
                    "title": "Synthetic Engineer",
                    "url": "https://synthetic.invalid/job",
                    "location": "Dublin",
                    "employment_type": "See job post",
                    "description": "Synthetic published vacancy responsibilities. " * 6,
                },
                {"title": "Synthetic Analyst", "url": "https://synthetic.invalid/job2", "description": "Snippet"},
            ]
        )
    finally:
        experience.run_key.reset(token)
        source_key.reset(source)
    metrics = experience.run_metrics("synthetic-run", 10)
    assert metrics["requests_sent"] == metrics["responses"] == 2
    assert metrics["requests_per_second"] == 0.2
    assert metrics["denials"] == metrics["cooldown_skips"] == 1
    assert metrics["transport_requests"] == {"http": 1, "browser": 1}
    denial = metrics["hosts"][0]["latest_denial"]
    assert denial["requests_sent_before_denial"] == denial["host_requests_in_previous_minute"] == 2
    assert metrics["quality"]["description_body_present"] == 1
    assert metrics["quality"]["opportunities_assessed"] == 2
    assert metrics["quality"]["employment_type_present"] == 0
    assert metrics["quota_established"] is False
    assert "secret" not in capsys.readouterr().err


def test_preferences_are_source_scoped_expire_and_stop_after_failures(monkeypatch):
    clock = [1000000]
    monkeypatch.setattr(experience.time, "time", lambda: clock[0])
    url = "https://synthetic.invalid/careers"
    experience.remember_transport("Synthetic", url, "browser", success=True)
    assert experience.preferred_transport("Synthetic", url) == "browser"
    assert experience.preferred_transport("Other", url) == "http"
    assert experience.preferred_transport("Synthetic", url + "2") == "http"
    for _ in range(3):
        experience.remember_transport("Synthetic", url, "browser", success=False)
    assert experience.preferred_transport("Synthetic", url) == "http"
    experience.remember_transport("Synthetic", url, "browser", success=True)
    clock[0] += 6 * 86400
    experience.remember_transport("Synthetic", url, "browser", success=True)
    clock[0] += 86400 + 1
    assert experience.preferred_transport("Synthetic", url) == "http"
    experience.remember_transport("Synthetic", url, "browser", success=True)
    assert experience.preferred_transport("Synthetic", url) == "browser"


def test_remote_profile_restore_does_not_reset_local_failures(monkeypatch):
    monkeypatch.setattr(experience.time, "time", lambda: 1000000)
    url = "https://synthetic.invalid/careers"
    profile = {
        "identity": experience.identity("Synthetic", url),
        "transport": "browser",
        "verified_at": 999999,
        "success": True,
    }
    experience.restore_profile("Other", url, profile)
    assert experience.preferred_transport("Other", url) == "http"
    experience.restore_profile("Synthetic", url, profile)
    assert experience.preferred_transport("Synthetic", url) == "browser"
    for _ in range(3):
        experience.remember_transport("Synthetic", url, "browser", success=False)
    experience.restore_profile("Synthetic", url, profile)
    assert experience.preferred_transport("Synthetic", url) == "http"


def configure_crawler(monkeypatch):
    monkeypatch.setattr(crawler, "catalog_entry_for_url", lambda _: {"provider": "generic"})
    for name in ("update_employer_status", "update_source_status", "log_scraper_event"):
        monkeypatch.setattr(crawler, name, Mock())
    monkeypatch.setattr(crawler, "save_jobs_batch", lambda jobs: len(jobs))


@pytest.mark.parametrize("status", [404, 403, 429])
def test_generic_http_failure_keeps_status_without_private_exception(monkeypatch, status):
    from email.message import Message
    from urllib.error import HTTPError

    configure_crawler(monkeypatch)
    url = "https://synthetic.invalid/careers"
    monkeypatch.setattr(
        crawler,
        "discover_employer_careers",
        Mock(side_effect=HTTPError(url, status, "private diagnostic", Message(), None)),
    )
    result = crawler.sync_single_employer("Synthetic", url, record_health=False)
    assert result.http_status == status
    assert result.error_code == ("source_http_failed" if status == 404 else "source_http_denial")
    assert result.error_code is not None
    assert "private diagnostic" not in result.error_code


def test_generic_local_cooldown_is_distinct_from_remote_denial(monkeypatch):
    import time

    from jobpulse_scraper.network.request_policy import HostCoolingDown

    configure_crawler(monkeypatch)
    url = "https://synthetic.invalid/careers"
    monkeypatch.setattr(crawler, "discover_employer_careers", Mock(side_effect=HostCoolingDown(url, time.time() + 60)))
    result = crawler.sync_single_employer("Synthetic", url, record_health=False)
    assert result.error_code == "source_cooldown"
    assert result.http_status is None
    assert result.request_sent is False


def test_positive_browser_fallback_is_used_first_next_run(monkeypatch):
    configure_crawler(monkeypatch)
    url = "https://synthetic.invalid/careers"
    http = Mock(return_value=(url, "static"))
    browser = Mock(return_value=(url, "rendered"))
    monkeypatch.setattr(crawler, "discover_employer_careers", http)
    monkeypatch.setattr(crawler, "fetch_via_browser", browser)
    monkeypatch.setattr(
        crawler,
        "extract_jobs_from_listing",
        lambda name, url, html, provider: [{"title": "Synthetic Engineer"}] if html == "rendered" else [],
    )
    assert crawler.sync_single_employer("Synthetic", url, record_health=False).opportunities_found == 1
    assert http.call_count == browser.call_count == 1
    assert crawler.sync_single_employer("Synthetic", url, record_health=False).opportunities_found == 1
    assert http.call_count == 1 and browser.call_count == 2


def test_cached_browser_failure_recovers_with_http_without_second_browser(monkeypatch):
    configure_crawler(monkeypatch)
    url = "https://synthetic.invalid/careers"
    experience.remember_transport("Synthetic", url, "browser", success=True)
    browser = Mock(side_effect=OSError("synthetic browser failure"))
    monkeypatch.setattr(crawler, "fetch_via_browser", browser)
    monkeypatch.setattr(crawler, "discover_employer_careers", lambda *args: (url, "static"))
    monkeypatch.setattr(crawler, "extract_jobs_from_listing", lambda *args: [{"title": "Synthetic Engineer"}])
    assert crawler.sync_single_employer("Synthetic", url, record_health=False).outcome == crawler.ScrapeOutcome.SYNCED
    assert browser.call_count == 1
    assert experience.preferred_transport("Synthetic", url) == "http"


def test_unsupported_and_empty_pages_do_not_claim_browser_is_required(monkeypatch):
    configure_crawler(monkeypatch)
    url = "https://synthetic.invalid/careers"
    monkeypatch.setattr(crawler, "discover_employer_careers", lambda *args: (url, "static"))
    browser = Mock(return_value=(url, "rendered without jobs"))
    monkeypatch.setattr(crawler, "fetch_via_browser", browser)
    monkeypatch.setattr(crawler, "extract_jobs_from_listing", lambda *args: [])
    assert (
        crawler.sync_single_employer("Synthetic", url, record_health=False).outcome == crawler.ScrapeOutcome.UNSUPPORTED
    )
    assert experience.preferred_transport("Synthetic", url) == "http"
    monkeypatch.setattr(crawler, "discover_employer_careers", lambda *args: (url, "No open positions"))
    assert crawler.sync_single_employer("Synthetic", url, record_health=False).outcome == crawler.ScrapeOutcome.EMPTY
    assert browser.call_count == 1


def test_repeated_429_increases_learned_delay_and_still_blocks_requests(monkeypatch):
    from jobpulse_scraper.network.request_policy import HostCoolingDown

    monkeypatch.setattr(experience.time, "time", lambda: 1000)
    url = "https://synthetic.invalid"
    gate.observe(url, 429, "120")
    gate.observe(url, 429, "120")
    row = experience.ledger().summary()[0]
    assert row["learned_interval_seconds"] == 12
    with pytest.raises(HostCoolingDown):
        gate.wait(url)
    assert experience.run_metrics("", 10)["requests_sent"] == 0


def test_report_compares_measured_runs_without_treating_old_history_as_zero():
    task = {"source_key": "synthetic", "target": {"employer": "Synthetic"}}

    def row(seconds=None):
        return {
            "status": "complete",
            "crawl_tasks": task,
            "result": {}
            if seconds is None
            else {
                "acquisition_metrics": {
                    "elapsed_seconds": seconds,
                    "requests_sent": 10,
                    "denials": 0,
                    "quality": {"opportunities_assessed": 2, "description_body_present": 1},
                },
            },
        }

    report = summarize_runs([row(10), row(20), row()])
    source = report["sources"][0]
    assert source["average_seconds"] == 15 and source["unmeasured_runs"] == 1
    assert source["latest_duration_change_seconds"] == -10
    assert source["description_body_coverage"] == 0.5
    assert json.dumps(report)


def test_synchronous_sources_keep_distinct_attribution_and_preserve_durable_context():
    with experience.source_scope("Synthetic", "https://synthetic.invalid"):
        first = experience.run_key.get()
        experience.event("request_sent", "synthetic.invalid")
        with experience.source_scope("Nested", "https://nested.invalid"):
            assert experience.run_key.get() == first
    assert experience.run_key.get() == "" and source_key.get() == "unassigned"
    with experience.source_scope("Other", "https://other.invalid"):
        second = experience.run_key.get()
        experience.event("request_sent", "other.invalid")
    assert first != second
    assert experience.run_metrics(first, 1)["hosts"][0]["host"] == "synthetic.invalid"
    assert experience.run_metrics(second, 1)["hosts"][0]["host"] == "other.invalid"


def test_routine_reports_are_unique_owner_readable_and_contain_measurements(tmp_path, monkeypatch):
    from pathlib import Path

    from jobpulse_scraper.runtime import reporting

    data = {
        "runs_in_window": 1,
        "sources": [{"measured_runs": 1, "runs": 1, "complete": 1, "requests_sent": 2, "denials": 0}],
    }
    monkeypatch.setattr(reporting, "crawl_report", lambda: data)
    first = reporting.save_crawl_report(tmp_path)
    second = reporting.save_crawl_report(tmp_path)
    assert first["crawl_report"] != second["crawl_report"]
    path = Path(first["crawl_report"])
    assert path.stat().st_mode & 0o777 == 0o600
    assert json.loads(path.read_text()) == data
    assert first["window_requests_sent"] == 2


def test_verified_routes_are_scoped_expire_and_fail_closed(monkeypatch):
    clock = [1000000]
    monkeypatch.setattr(experience.time, "time", lambda: clock[0])
    url = "https://synthetic.invalid/careers"
    target = "https://ats.synthetic.invalid/roles"
    experience.remember_route("Synthetic", url, target, success=True)
    assert experience.preferred_route("Synthetic", url) == target
    assert experience.preferred_route("Other", url) == url
    clock[0] += 7 * 86400 + 1
    assert experience.preferred_route("Synthetic", url) == url
    experience.remember_route("Synthetic", url, target, success=True)
    experience.remember_route("Synthetic", url, target, success=False)
    assert experience.preferred_route("Synthetic", url) == url


@pytest.mark.parametrize(
    "target", ["https://ats.invalid/roles?token=secret", "https://u:p@ats.invalid/", "file:///tmp/x"]
)
def test_session_and_nonpublic_routes_are_not_retained(target):
    url = "https://synthetic.invalid/careers"
    experience.remember_route("Synthetic", url, target, success=True)
    assert experience.preferred_route("Synthetic", url) == url


def test_successful_redirect_skips_old_destination_next_run(monkeypatch):
    configure_crawler(monkeypatch)
    url = "https://synthetic.invalid/careers"
    target = "https://ats.synthetic.invalid/roles"
    discover = Mock(return_value=(target, "static"))
    monkeypatch.setattr(crawler, "discover_employer_careers", discover)
    monkeypatch.setattr(crawler, "extract_jobs_from_listing", lambda *args: [{"title": "Synthetic Engineer"}])
    assert crawler.sync_single_employer("Synthetic", url, record_health=False).opportunities_found == 1
    assert crawler.sync_single_employer("Synthetic", url, record_health=False).opportunities_found == 1
    assert discover.call_args_list[0].args == ("Synthetic", url)
    assert discover.call_args_list[1].args == ("Synthetic", target)


def test_report_keeps_failure_actions_bound_to_the_configured_source():
    report = summarize_runs(
        [
            {
                "status": "incomplete",
                "crawl_tasks": {"source_key": "synthetic", "target": {"employer": "Synthetic"}},
                "result": {"error_code": "source_payload_invalid"},
            },
            {
                "status": "blocked",
                "crawl_tasks": {"source_key": "other", "target": {"employer": "Other"}},
                "result": {"error_code": "source_http_denial"},
            },
        ]
    )
    sources = {row["source_key"]: row for row in report["sources"]}
    assert "payload schema" in sources["synthetic"]["recommended_actions"]["source_payload_invalid"]
    assert "stop requests" in sources["other"]["recommended_actions"]["source_http_denial"]
    assert sources["synthetic"]["complete"] == 0
    assert sources["other"]["unmeasured_runs"] == 1


def test_stage_durations_survive_failure_without_payload_logs(monkeypatch, capsys):
    clock = iter([10.0, 12.5])
    monkeypatch.setattr(experience.time, "monotonic", lambda: next(clock))
    token = experience.run_key.set("synthetic-stages")
    try:
        with pytest.raises(ValueError):
            with experience.measured_stage("catalog_read"):
                raise ValueError("private body")
    finally:
        experience.run_key.reset(token)
    assert experience.run_metrics("synthetic-stages", 3)["stage_seconds"] == {"catalog_read": 2.5}
    assert "private body" not in capsys.readouterr().err
