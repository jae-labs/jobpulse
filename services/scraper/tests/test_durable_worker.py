"""Worker failure, lease loss and bounded draining remain distinct outcomes."""

import json
import threading
from unittest.mock import MagicMock

import pytest

from jobpulse_scraper.runtime.lease import active_lease
from jobpulse_scraper.runtime.queue import CrawlQueue, CrawlTask, run_worker


@pytest.fixture
def task():
    return CrawlTask(
        id="synthetic-task",
        source_key="synthetic-source",
        lease_token="synthetic-lease",
        target={"employer": "Synthetic"},
        attempt=1,
    )


def test_worker_scopes_fenced_ingestion_and_drains_only_bound(task):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.return_value = task
    queue.finish.return_value = True
    contexts = []

    def execute(current):
        contexts.append(active_lease.get())
        return {"status": "complete", "persisted": 1}

    assert run_worker(queue, max_tasks=2, execute=execute) == {"complete": 2, "incomplete": 0, "lease_lost": 0}
    assert queue.claim.call_count == 2
    assert all(context.task_id == task.id and context.token == task.lease_token for context in contexts)
    assert active_lease.get() is None


def test_source_exception_is_incomplete_and_exception_content_is_not_history(task):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None]
    queue.finish.return_value = True

    def execute(current):
        raise RuntimeError("private diagnostic content")

    assert run_worker(queue, execute=execute)["incomplete"] == 1
    recorded = queue.finish.call_args.args[1]
    assert recorded["status"] == "incomplete" and recorded["error_code"] == "source_execution_failed"
    assert recorded["acquisition_metrics"]["requests_sent"] == 0
    assert "private diagnostic content" not in json.dumps(recorded)
    assert active_lease.get() is None


def test_stale_completion_is_never_reported_successful(task):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None]
    queue.finish.return_value = False
    assert run_worker(queue, execute=lambda _: {"status": "complete"}) == {
        "complete": 0,
        "incomplete": 0,
        "lease_lost": 1,
    }


def test_worker_progress_reports_committed_outcome_and_empty_queue(task, capsys):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None]
    queue.finish.return_value = True
    run_worker(queue, execute=lambda _: {"status": "complete", "persisted": 3})
    records = [json.loads(line) for line in capsys.readouterr().err.splitlines()]
    events = [record["crawl_event"] for record in records]
    assert events.index("task_start") < events.index("saving_task_outcome") < events.index("task_finished")
    finished = next(record for record in records if record["crawl_event"] == "task_finished")
    assert finished["persisted"] == 3 and finished["status"] == "complete"
    assert finished["source"] == "Synthetic" and finished["attempt"] == 1
    assert events[-2:] == ["no_due_tasks", "worker_finished"]


def test_failed_source_progress_exposes_retry_floor_without_exception_content(task, capsys):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None]
    queue.finish.return_value = True

    def execute(_):
        raise RuntimeError("private diagnostic content")

    run_worker(queue, execute=execute)
    output = capsys.readouterr().err
    assert "private diagnostic content" not in output
    records = [json.loads(line) for line in output.splitlines()]
    finished = next(record for record in records if record["crawl_event"] == "task_finished")
    assert finished["status"] == "incomplete" and finished["retry_min_seconds"] == 21600
    assert finished["error_code"] == "source_execution_failed"


def test_durable_detail_task_persists_a_verified_short_published_body(monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime

    detail_task = CrawlTask(
        id="detail-task",
        source_key="detail:7",
        lease_token="synthetic-lease",
        target={"kind": "detail", "job_id": 7},
        attempt=1,
    )
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": 7, "title": "Chef", "description": "stub", "url": "https://jobsireland.ie/job/7"}
    ]
    short_body = "A complete, concise published requirement for this synthetic chef position."
    monkeypatch.setattr(runtime, "get_supabase", lambda: client)
    monkeypatch.setattr(
        runtime,
        "enrich_job",
        lambda job: {**job, "description": short_body, "_verified_short_detail": True},
    )
    persisted: list[dict[str, object]] = []

    def persist(jobs, **_kwargs):
        for job in jobs:
            assert job.pop("_verified_short_detail", False) is True
            persisted.append(job)
        return len(jobs)

    monkeypatch.setattr(runtime, "save_jobs_batch", persist)

    result = runtime.execute_task(detail_task)

    assert result == {"status": "complete", "persisted": 1}
    assert persisted[0]["description"] == short_body
    assert "_verified_short_detail" not in persisted[0]


def test_lost_lease_progress_never_reports_success(task, capsys):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None]
    queue.finish.return_value = False
    run_worker(queue, execute=lambda _: {"status": "complete"})
    events = [json.loads(line)["crawl_event"] for line in capsys.readouterr().err.splitlines()]
    assert "lease_lost" in events and "task_finished" not in events


def test_concurrent_worker_reports_shared_task_progress_and_slot_count(task, capsys):
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None, None]
    queue.finish.return_value = True

    result = run_worker(queue, max_tasks=2, concurrency=2, execute=lambda _: {"status": "complete"})

    records = [json.loads(line) for line in capsys.readouterr().err.splitlines()]
    starts = [row for row in records if row["crawl_event"] == "task_claimed"]
    progress = [row for row in records if row["crawl_event"] == "batch_progress"]
    assert result == {"complete": 1, "incomplete": 0, "lease_lost": 0}
    assert len(starts) == 1 and starts[0]["max_tasks"] == 2 and starts[0]["concurrency"] == 2
    assert progress[0]["completed_tasks"] == 0
    assert progress[-1]["completed_tasks"] == 1 and progress[-1]["claimed_tasks"] == 1


def test_long_task_reports_activity_while_renewing_lease(task, monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime

    observed = threading.Event()
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.side_effect = [task, None]
    queue.finish.return_value = True
    queue.renew.return_value = True
    monkeypatch.setattr(runtime, "PROGRESS_INTERVAL_SECONDS", 0.01)

    def report(event, current=None, **fields):
        if event == "task_active":
            assert current is task and fields["elapsed_seconds"] >= 0
            observed.set()

    monkeypatch.setattr(runtime, "report_progress", report)

    def execute(_):
        assert observed.wait(2), "Long task must receive progress before completion"
        return {"status": "complete"}

    assert run_worker(queue, execute=execute)["complete"] == 1
    queue.renew.assert_called_with(task, 120)


def test_progress_omits_source_urls_tokens_and_job_payloads(task, capsys):
    from jobpulse_scraper.runtime.queue import report_progress

    task.source_key = "https://example.invalid/?token=synthetic-secret"
    task.target = {"kind": "detail", "job_id": 123, "description": "synthetic-private-body"}
    report_progress("task_start", task)
    output = capsys.readouterr().err
    assert "synthetic-secret" not in output and "synthetic-private-body" not in output
    assert task.lease_token not in output
    assert json.loads(output)["source"] == "catalog enrichment"


def test_concurrent_slots_share_one_task_budget_and_overlap(task, capsys):
    from threading import Barrier

    queue = MagicMock(spec=CrawlQueue)
    queue.claim.return_value = task
    queue.finish.return_value = True
    overlap = Barrier(2)

    def execute(_):
        overlap.wait(timeout=2)
        return {"status": "complete"}

    result = run_worker(queue, max_tasks=2, concurrency=2, execute=execute)
    assert result["complete"] == 2 and queue.claim.call_count == 2
    queue.purge_history.assert_called_once()
    events = [json.loads(line)["crawl_event"] for line in capsys.readouterr().err.splitlines()]
    assert "task_budget_exhausted" in events
    assert "no_due_tasks" not in events


@pytest.mark.parametrize("max_tasks,lease", [(0, 120), (10_001, 120), (1, 9), (1, 3601)])
def test_worker_bounds(max_tasks, lease):
    with pytest.raises(ValueError):
        run_worker(MagicMock(spec=CrawlQueue), max_tasks=max_tasks, lease_seconds=lease)


def test_local_cooldown_is_not_reported_as_a_remote_429(monkeypatch):
    import time

    import jobpulse_scraper.runtime.queue as runtime
    from jobpulse_scraper.contracts import SourceAdapter
    from jobpulse_scraper.network.request_policy import HostCoolingDown
    from jobpulse_scraper.runtime.queue import execute_task

    source = CrawlTask(
        id="synthetic-task",
        source_key="synthetic-source",
        lease_token="synthetic-lease",
        target={
            "employer": "Synthetic",
            "url": "https://synthetic.invalid",
            "provider": "synthetic",
            "identifier": "synthetic",
        },
        attempt=1,
    )

    def denied(_request):
        raise HostCoolingDown("https://synthetic.invalid", time.time() + 60)

    monkeypatch.setitem(runtime.ADAPTERS, "synthetic", SourceAdapter(lambda *_: [], lambda target: target.url))
    transport = MagicMock()
    transport.fetch.side_effect = denied
    monkeypatch.setattr(runtime, "HttpTransport", lambda: transport)
    monkeypatch.setattr(runtime, "RequestLedger", lambda *_: MagicMock(cooldown=lambda _: 0))
    result = execute_task(source)
    assert result["status"] == "blocked"
    assert result["error_code"] == "source_cooldown"
    assert result["request_sent"] is False
    assert "http_status" not in result
    assert result["retry_after_seconds"] > 0


def test_snapshot_budget_failure_has_distinct_source_outcome(monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime
    from jobpulse_scraper.contracts import SourceAdapter
    from jobpulse_scraper.snapshots import SnapshotBudgetExceeded

    source = CrawlTask(
        id="synthetic-task",
        source_key="synthetic-source",
        lease_token="synthetic-lease",
        target={
            "employer": "Synthetic",
            "url": "https://synthetic.invalid",
            "provider": "synthetic",
            "identifier": "synthetic",
        },
        attempt=1,
    )
    monkeypatch.setitem(runtime.ADAPTERS, "synthetic", SourceAdapter(lambda *_: [], lambda target: target.url))
    transport = MagicMock()
    transport.fetch.side_effect = SnapshotBudgetExceeded("Synthetic snapshot budget reached")
    monkeypatch.setattr(runtime, "HttpTransport", lambda: transport)
    monkeypatch.setattr(runtime, "RecordingTransport", lambda transport, *args: transport)

    result = runtime.execute_task(source)
    assert result["status"] == "incomplete"
    assert result["error_code"] == "source_snapshot_budget_exceeded"


def test_idle_enqueue_database_failure_cannot_be_treated_as_empty(monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime

    client = MagicMock()
    client.rpc.return_value.execute.side_effect = RuntimeError("Synthetic unavailable database")
    monkeypatch.setattr(runtime, "get_supabase", lambda: client)
    with pytest.raises(RuntimeError):
        CrawlQueue().enqueue_if_idle([])


def test_worker_accepts_ten_thousand_tasks_and_stops_when_nothing_is_due():
    queue = MagicMock(spec=CrawlQueue)
    queue.claim.return_value = None
    assert run_worker(queue, max_tasks=10_000) == {"complete": 0, "incomplete": 0, "lease_lost": 0}
    queue.claim.assert_called_once()


@pytest.mark.parametrize(
    "count,expected_sizes", [(0, [0]), (1000, [1000]), (1001, [1000, 1]), (2501, [1000, 1000, 501])]
)
def test_startup_batches_large_catalog_without_dropping_sources(monkeypatch, count, expected_sizes):
    import jobpulse_scraper.runtime.queue as runtime

    client = MagicMock()
    submitted = []

    def rpc(name, params):
        assert name == "enqueue_crawls_if_idle"
        batch = params["p_targets"]
        submitted.append(batch)
        return MagicMock(execute=lambda: MagicMock(data=len(batch)))

    client.rpc.side_effect = rpc
    monkeypatch.setattr(runtime, "get_supabase", lambda: client)
    targets = [{"source_key": f"synthetic-{i}", "target": {"url": "https://example.invalid"}} for i in range(count)]
    assert CrawlQueue().enqueue_if_idle(targets) == count
    assert [len(batch) for batch in submitted] == expected_sizes
    assert [target for batch in submitted for target in batch] == targets


def test_startup_batches_by_payload_size_and_rejects_oversized_target_before_writes(monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime

    client = MagicMock()
    client.rpc.return_value.execute.return_value.data = 1
    monkeypatch.setattr(runtime, "get_supabase", lambda: client)
    target = {"source_key": "synthetic", "target": {"url": "x" * (3 * 1024 * 1024)}}
    assert CrawlQueue().enqueue_if_idle([target, target]) == 2
    assert client.rpc.call_count == 2
    client.reset_mock()
    with pytest.raises(ValueError, match="target exceeds request budget"):
        CrawlQueue().enqueue_if_idle([target, {"target": {"url": "x" * (5 * 1024 * 1024)}}])
    client.rpc.assert_not_called()


def test_stale_detail_task_does_not_refetch_an_available_body(monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime

    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": 7, "description": "Complete published responsibilities for a synthetic role. " * 4}
    ]
    monkeypatch.setattr(runtime, "get_supabase", lambda: client)
    extract = MagicMock(side_effect=AssertionError("Already available body must not be fetched"))
    monkeypatch.setattr(runtime, "enrich_job", extract)
    task = CrawlTask(
        id="synthetic",
        source_key="detail:7",
        lease_token="synthetic",
        target={"kind": "detail", "job_id": 7},
        attempt=1,
    )
    assert runtime.execute_task(task) == {"status": "complete", "persisted": 0, "body_already_available": True}
    extract.assert_not_called()


def test_detail_task_cannot_report_success_when_persistence_rejects_job(monkeypatch):
    import jobpulse_scraper.runtime.queue as runtime

    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": 7, "description": "stub"}
    ]
    monkeypatch.setattr(runtime, "get_supabase", lambda: client)
    monkeypatch.setattr(
        runtime, "enrich_job", lambda job: {**job, "description": "Complete published responsibilities. " * 4}
    )
    monkeypatch.setattr(runtime, "save_jobs_batch", lambda *_args, **_kwargs: 0)
    task = CrawlTask(
        id="synthetic",
        source_key="detail:7",
        lease_token="synthetic",
        target={"kind": "detail", "job_id": 7},
        attempt=1,
    )
    assert runtime.execute_task(task) == {
        "status": "incomplete",
        "persisted": 0,
        "error_code": "detail_persistence_rejected",
    }
