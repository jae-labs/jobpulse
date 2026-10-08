"""Worker failure, lease loss and bounded draining remain distinct outcomes."""

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
    assert queue.finish.call_args.args[1] == {"status": "incomplete", "error_code": "source_execution_failed"}
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
