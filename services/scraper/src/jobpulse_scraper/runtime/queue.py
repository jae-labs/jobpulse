"""Bounded durable workers with renewal, retry history and fenced catalog writes."""

from __future__ import annotations

import hashlib
import json
import sys
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from urllib.error import HTTPError
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, ConfigDict, Field

from jobpulse_scraper.config import load_board_config
from jobpulse_scraper.config.boards import detect_provider, is_cooled_down
from jobpulse_scraper.contracts import MAX_WORKER_TASKS, FetchResponse, ResponseBudgetExceeded, SourceTarget
from jobpulse_scraper.database.board_health import record_board_outcome
from jobpulse_scraper.database.client import get_supabase
from jobpulse_scraper.database.embeddings import prepare_embeddings
from jobpulse_scraper.database.records import response_count, response_records
from jobpulse_scraper.database.repository import IngestionIncompleteError, save_jobs_batch, update_employer_status
from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.network.browser import BrowserRequestBudgetExceeded
from jobpulse_scraper.network.experience import (
    preferred_transport,
    remember_transport,
    restore_profile,
    run_identity,
    run_key,
    run_metrics,
)
from jobpulse_scraper.network.ledger import RequestLedger, source_key
from jobpulse_scraper.network.recording import RecordingTransport
from jobpulse_scraper.network.request_policy import STATE_PATH, ContentChallenge, HostCoolingDown, retry_after_seconds
from jobpulse_scraper.network.transport import BrowserTransport, HttpTransport
from jobpulse_scraper.paths import STATE_ROOT
from jobpulse_scraper.pipeline.detail_enrichment import enrich_job
from jobpulse_scraper.pipeline.runner import synchronize
from jobpulse_scraper.runtime.lease import Lease, active_lease, active_snapshot
from jobpulse_scraper.scrapers.adapters import ADAPTERS
from jobpulse_scraper.snapshots import PARSER_VERSION, SnapshotBudgetExceeded, SnapshotStore, public_url

PROGRESS_INTERVAL_SECONDS = 30


class CrawlTask(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    source_key: str
    target: dict[str, Any]
    lease_token: str
    attempt: int = Field(ge=1)


class WorkerQueue(Protocol):
    def purge_history(self) -> None: ...
    def claim(self, lease_seconds: int) -> CrawlTask | None: ...
    def renew(self, task: CrawlTask, lease_seconds: int) -> bool: ...
    def finish(self, task: CrawlTask, result: dict[str, Any]) -> bool: ...
    def record_outcome(self, task: CrawlTask, result: dict[str, Any]) -> None: ...


def report_progress(event: str, task: CrawlTask | None = None, **fields: Any) -> None:
    """Flush public crawl progress without credentials, payloads or exception text."""
    record = {"time": datetime.now(UTC).isoformat(timespec="seconds"), "crawl_event": event, **fields}
    if task is not None:
        record.update(
            task_id=task.id,
            run_id=run_identity(task.id, task.lease_token),
            source=str(task.target.get("employer") or "catalog enrichment")[:120],
            kind=task.target.get("kind") if task.target.get("kind") in {"detail", "vector"} else "source",
            attempt=task.attempt,
        )
    print(json.dumps(record, ensure_ascii=True), file=sys.stderr, flush=True)


class CrawlQueue:
    def enqueue(self, source_key: str, target: dict[str, Any], priority: int = 50) -> str:
        return str(
            get_supabase()
            .rpc(
                "enqueue_crawl",
                {
                    "p_source_key": source_key,
                    "p_target": target,
                    "p_priority": priority,
                },
            )
            .execute()
            .data
        )

    def enqueue_if_idle(self, targets: list[dict[str, Any]]) -> int:
        """Seed eligible sources without resetting their pending/running work."""
        # Leave headroom below the database's 8 MiB JSONB text budget.
        batches: list[list[dict[str, Any]]] = [[]]
        batch_bytes = 2
        for target in targets:
            target_bytes = len(json.dumps(target, ensure_ascii=True).encode("utf-8")) + 2
            if target_bytes + 2 > 4 * 1024 * 1024:
                raise ValueError("Crawl startup target exceeds request budget")
            if len(batches[-1]) >= 1000 or batch_bytes + target_bytes > 4 * 1024 * 1024:
                batches.append([])
                batch_bytes = 2
            batches[-1].append(target)
            batch_bytes += target_bytes
        return sum(
            response_count(get_supabase().rpc("enqueue_crawls_if_idle", {"p_targets": batch}).execute().data)
            for batch in batches
        )

    def purge_history(self) -> None:
        get_supabase().rpc("purge_crawl_history").execute()

    def record_outcome(self, task: CrawlTask, result: dict[str, Any]) -> None:
        board_id = task.target.get("board_id")
        if isinstance(board_id, int) and not isinstance(board_id, bool):
            record_board_outcome(
                get_supabase(),
                board_id,
                success=result.get("status") == "complete",
                ingested=result.get("persisted", 0),
                found=result.get("found"),
                error=result.get("error_code"),
            )

    def claim(self, lease_seconds: int) -> CrawlTask | None:
        rows = response_records(get_supabase().rpc("claim_crawl", {"p_lease_seconds": lease_seconds}).execute().data)
        return CrawlTask.model_validate(rows[0]) if rows else None

    def renew(self, task: CrawlTask, lease_seconds: int) -> bool:
        return (
            get_supabase()
            .rpc(
                "renew_crawl",
                {
                    "p_task_id": task.id,
                    "p_token": task.lease_token,
                    "p_lease_seconds": lease_seconds,
                },
            )
            .execute()
            .data
            is True
        )

    def finish(self, task: CrawlTask, result: dict[str, Any]) -> bool:
        return (
            get_supabase()
            .rpc(
                "finish_crawl",
                {
                    "p_task_id": task.id,
                    "p_token": task.lease_token,
                    "p_status": result.get("status")
                    if result.get("status") in {"complete", "blocked"}
                    else "incomplete",
                    "p_result": result,
                    "p_retry_at": (datetime.now(UTC) + timedelta(seconds=result["retry_after_seconds"])).isoformat()
                    if result.get("retry_after_seconds", 0) > 0
                    else None,
                },
            )
            .execute()
            .data
            is True
        )


def enqueue_configured(
    queue: CrawlQueue, employer: str | None = None, limit: int | None = None, *, only_if_idle: bool = False
) -> int:
    targets = [row for row in load_board_config() if row.get("enabled", True) and not is_cooled_down(row)]
    if employer:
        targets = [row for row in targets if row["name"].casefold() == employer.casefold()]
    if limit:
        targets = targets[:limit]
    requests = [
        {
            "source_key": str(row.get("board_id") or row["careers_url"]),
            "target": {
                "employer": row["name"],
                "url": row["careers_url"],
                "board_id": row.get("board_id"),
                "provider": row.get("provider"),
                "identifier": row.get("board"),
            },
            "priority": row.get("priority", 50),
        }
        for row in targets
    ]
    if only_if_idle:
        return queue.enqueue_if_idle(requests)
    for request in requests:
        queue.enqueue(request["source_key"], request["target"], request["priority"])
    return len(requests)


def execute_task(task: CrawlTask) -> dict[str, Any]:
    from jobpulse_scraper.network.experience import measured_stage

    kind = task.target.get("kind")
    if kind in {"detail", "vector"}:
        job_id = task.target.get("job_id")
        if not isinstance(job_id, int) or isinstance(job_id, bool):
            raise ValueError("Enrichment requires a catalog job identity")
        with measured_stage("catalog_read"):
            rows = response_records(get_supabase().table("jobs").select("*").eq("id", job_id).limit(1).execute().data)
        if not rows:
            return {"status": "complete", "removed_job": True}
        job = rows[0]
        if kind == "detail":
            if not job.get("description_is_snippet") and has_description_body(job.get("description")):
                return {"status": "complete", "persisted": 0, "body_already_available": True}
            report_progress("fetching_detail", task)
            with measured_stage("detail_extraction"):
                enriched = enrich_job(job)
            verified_short_detail = enriched.get("_verified_short_detail") is True
            if not verified_short_detail and not has_description_body(enriched.get("description")):
                return {"status": "incomplete", "error_code": "published_body_unavailable"}
            report_progress("persisting_detail", task)
            with measured_stage("catalog_persist"):
                persisted = save_jobs_batch([enriched], enrich=False)
            if persisted != 1:
                return {"status": "incomplete", "persisted": persisted, "error_code": "detail_persistence_rejected"}
            return {"status": "complete", "persisted": persisted}
        report_progress("preparing_vectors", task)
        with measured_stage("vector_prepare"):
            pending = prepare_embeddings([job])
        return {"status": "incomplete" if pending else "complete", "vectors_pending": pending}
    employer = task.target.get("employer")
    if not isinstance(employer, str) or not employer.strip():
        raise ValueError("Crawl target requires a configured employer")
    url = task.target.get("url")
    provider, identifier = detect_provider(url) if isinstance(url, str) else ("", "")
    configured_provider, configured_identifier = task.target.get("provider"), task.target.get("identifier")
    if isinstance(configured_provider, str) and configured_provider in ADAPTERS:
        provider = configured_provider
        if isinstance(configured_identifier, str):
            identifier = configured_identifier
    if employer == "The Housing Agency":
        provider = "housing_agency"
    elif employer == "IDA Ireland":
        provider = "ida"
    elif employer == "Kildare County Council":
        provider = "kildare"
    if isinstance(url, str) and provider not in ADAPTERS:
        previous = response_records(
            get_supabase()
            .table("crawl_runs")
            .select("result")
            .eq("task_id", task.id)
            .eq("status", "complete")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if previous:
            restore_profile(
                employer, url, previous[0].get("result", {}).get("acquisition_metrics", {}).get("source_profile")
            )
    if provider in ADAPTERS and isinstance(url, str):
        target = SourceTarget(provider, employer, url, identifier)
        adapter = ADAPTERS[provider]
        snapshots: list[str] = []
        found = persisted = 0
        found_urls: set[str] = set()

        def record(response: FetchResponse, snapshot: str) -> None:
            digest = hashlib.sha256(response.body).hexdigest()
            snapshot_id = str(
                get_supabase()
                .rpc(
                    "record_crawl_snapshot",
                    {
                        "p_task_id": task.id,
                        "p_token": task.lease_token,
                        "p_snapshot": {
                            "url": public_url(response.url),
                            "status": response.status,
                            "content_hash": digest,
                            "body_key": digest + ".bin",
                            "body_bytes": len(response.body),
                            "parser_version": PARSER_VERSION,
                            "replay_key": snapshot,
                        },
                    },
                )
                .execute()
                .data
            )
            active_snapshot.set(snapshot_id)
            snapshots.append(snapshot)

        transport = RecordingTransport(
            BrowserTransport() if adapter.transport_kind == "browser" else HttpTransport(),
            target,
            SnapshotStore(STATE_ROOT / "snapshots"),
            record,
        )
        try:
            report_progress("fetching_source", task, provider=provider)
            for _, jobs in adapter.pages(target, transport):
                found_urls.update(job.url for job in jobs)
                found = len(found_urls)
                report_progress("persisting_page", task, page=len(snapshots), found=len(jobs))
                persisted += save_jobs_batch([job.as_record() for job in jobs])
                report_progress("page_persisted", task, found=found, persisted=persisted)
        except IngestionIncompleteError as error:
            raise IngestionIncompleteError(persisted + error.persisted, error.failed, error.vectors_pending) from error
        except Exception as error:
            status, error_code = "incomplete", "source_acquisition_failed"
            details: dict[str, Any] = {}
            if isinstance(error, BrowserRequestBudgetExceeded):
                error_code = "browser_request_budget_exceeded"
            elif isinstance(error, ContentChallenge):
                status, error_code = "blocked", "source_content_challenge"
                details["http_status"] = error.status
                details["retry_after_seconds"] = max(
                    0,
                    RequestLedger(STATE_PATH.with_suffix(".sqlite3")).cooldown(urlsplit(error.url).netloc.lower())
                    - time.time(),
                )
            elif isinstance(error, ResponseBudgetExceeded):
                error_code = "source_response_budget_exceeded"
            elif isinstance(error, SnapshotBudgetExceeded):
                error_code = "source_snapshot_budget_exceeded"
            elif isinstance(error, HTTPError):
                if isinstance(error, HostCoolingDown):
                    details["request_sent"] = False
                else:
                    details["http_status"] = error.code
                error_code = "source_http_failed"
                if error.code in {401, 403, 429}:
                    status = "blocked"
                    error_code = "source_cooldown" if isinstance(error, HostCoolingDown) else "source_http_denial"
                    until = RequestLedger(STATE_PATH.with_suffix(".sqlite3")).cooldown(
                        urlsplit(error.url).netloc.lower()
                    )
                    details["retry_after_seconds"] = max(
                        0, until - time.time(), retry_after_seconds(error.headers.get("Retry-After"))
                    )
            elif isinstance(error, ValueError):
                error_code = "source_payload_invalid"
            return {
                "status": status,
                "found": found,
                "persisted": persisted,
                "snapshots": snapshots,
                "error_code": error_code,
                "pages_received": len(snapshots),
                **details,
            }
        update_employer_status(employer, "Synced" if found else "Monitored", found, url)
        return {
            "status": "complete",
            "found": found,
            "persisted": persisted,
            "failed_writes": 0,
            "vectors_pending": 0,
            "snapshots": snapshots,
            "pages_received": len(snapshots),
        }
    from jobpulse_scraper.scrapers.registry import CORE_SCRAPERS

    if any(name.casefold() == employer.casefold() for _, name, _, _ in CORE_SCRAPERS):
        report_progress("running_source_pipeline", task)
        result = synchronize(employer=employer)
        return {
            key: result[key]
            for key in (
                "status",
                "persisted",
                "failed_writes",
                "vectors_pending",
                "failed_sources",
                "scraped_employers",
            )
            if key in result
        }
    from jobpulse_scraper.scrapers.generic.crawler import ScrapeOutcome, sync_single_employer

    if not isinstance(url, str):
        raise ValueError("Source crawl requires a public URL")
    report_progress("running_source_pipeline", task)
    result = sync_single_employer(employer, url, record_health=False)
    complete = result.outcome in {ScrapeOutcome.SYNCED, ScrapeOutcome.EMPTY}
    return {
        "status": "complete" if complete else "blocked" if result.outcome == ScrapeOutcome.BLOCKED else "incomplete",
        "found": result.opportunities_found,
        "persisted": result.added,
        "failed_writes": result.failed_writes,
        "vectors_pending": result.vectors_pending,
        "error_code": None if complete else result.error_code or result.outcome.value,
        **({"http_status": result.http_status} if result.http_status is not None else {}),
        **({"request_sent": result.request_sent} if result.request_sent is not None else {}),
    }


def _run_worker_serial(
    queue: WorkerQueue,
    max_tasks: int = 20,
    lease_seconds: int = 120,
    execute: Callable[[CrawlTask], dict[str, Any]] = execute_task,
) -> dict[str, int]:
    if not 1 <= max_tasks <= MAX_WORKER_TASKS or not 10 <= lease_seconds <= 3600:
        raise ValueError("Worker task and lease bounds are invalid")
    report_progress("worker_start", max_tasks=max_tasks)
    report_progress("purging_history")
    queue.purge_history()
    counts = {"complete": 0, "incomplete": 0, "lease_lost": 0}
    for index in range(max_tasks):
        report_progress("claiming_task", task_number=index + 1)
        task = queue.claim(lease_seconds)
        if task is None:
            report_progress(getattr(queue, "stop_reason", None) or "no_due_tasks")
            break
        started = time.monotonic()
        report_progress("task_start", task, task_number=index + 1, max_tasks=max_tasks)
        stopped = threading.Event()
        lost = threading.Event()

        def heartbeat(
            current: CrawlTask = task,
            stop: threading.Event = stopped,
            failure: threading.Event = lost,
            began: float = started,
        ) -> None:
            while not stop.wait(min(lease_seconds / 3, PROGRESS_INTERVAL_SECONDS)):
                try:
                    if not queue.renew(current, lease_seconds):
                        failure.set()
                        return
                    report_progress("task_active", current, elapsed_seconds=round(time.monotonic() - began, 1))
                except Exception:
                    failure.set()
                    return

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        snapshot_token = active_snapshot.set(None)
        source_token = source_key.set(task.source_key)
        context_token = active_lease.set(Lease(task.id, task.lease_token))
        run_id = run_identity(task.id, task.lease_token)
        run_token = run_key.set(run_id)
        try:
            result: dict[str, Any]
            try:
                result = execute(task)
            except IngestionIncompleteError as error:
                result = {
                    "status": "incomplete",
                    "persisted": error.persisted,
                    "failed_writes": error.failed,
                    "vectors_pending": error.vectors_pending,
                }
            except Exception:
                result = {"status": "incomplete", "error_code": "source_execution_failed"}
            report_progress("saving_task_outcome", task)
            company, url = task.target.get("employer"), task.target.get("url")
            if (
                result.get("error_code") in {"task_deadline_exceeded", "task_process_failed"}
                and isinstance(company, str)
                and isinstance(url, str)
                and preferred_transport(company, url) == "browser"
            ):
                remember_transport(company, url, "browser", success=False)
            result["acquisition_metrics"] = run_metrics(run_id, time.monotonic() - started)
            if lost.is_set() or not queue.finish(task, result):
                counts["lease_lost"] += 1
                report_progress("lease_lost", task)
            else:
                counts["complete" if result.get("status") == "complete" else "incomplete"] += 1
                queue.record_outcome(task, result)
                summary = {
                    key: result[key]
                    for key in ("found", "persisted", "failed_writes", "vectors_pending", "pages_received")
                    if isinstance(result.get(key), int)
                }
                if result.get("status") != "complete" and task.target.get("kind") not in {"detail", "vector"}:
                    summary["retry_min_seconds"] = max(21600, result.get("retry_after_seconds", 0))
                report_progress(
                    "task_finished",
                    task,
                    status=result.get("status", "incomplete"),
                    error_code=result.get("error_code"),
                    elapsed_seconds=round(time.monotonic() - started, 1),
                    **summary,
                )
                report_progress("acquisition_summary", task, **result["acquisition_metrics"])
        finally:
            active_lease.reset(context_token)
            source_key.reset(source_token)
            active_snapshot.reset(snapshot_token)
            run_key.reset(run_token)
            stopped.set()
            thread.join()
    report_progress("worker_finished", counts=counts)
    return counts


def run_worker(
    queue: CrawlQueue,
    max_tasks: int = 20,
    lease_seconds: int = 120,
    execute: Callable[[CrawlTask], dict[str, Any]] = execute_task,
    *,
    concurrency: int = 1,
    task_timeout: float = 120,
) -> dict[str, int]:
    """Drain one shared task budget with independently cancellable execution slots."""
    from concurrent.futures import ThreadPoolExecutor

    from jobpulse_scraper.runtime.process_execution import TaskProcess

    if not 1 <= concurrency <= 4 or not 1 <= max_tasks <= MAX_WORKER_TASKS or not 10 <= lease_seconds <= 3600:
        raise ValueError("Worker task, concurrency and lease bounds are invalid")
    if not 1 <= task_timeout <= 3600:
        raise ValueError("Task deadline must be between one second and one hour")
    queue.purge_history()
    lock = threading.Lock()
    claimed = 0
    unknown_claims = 0
    completed = 0
    cancelled = threading.Event()
    processes: set[TaskProcess] = set()

    class BudgetQueue:
        stop_reason = "no_due_tasks"
        renew = queue.renew
        record_outcome = queue.record_outcome

        def purge_history(self) -> None:
            pass

        def claim(self, lease_seconds: int) -> CrawlTask | None:
            nonlocal claimed, unknown_claims
            for attempt in range(1, 4):
                with lock:
                    if cancelled.is_set() or claimed + unknown_claims >= max_tasks:
                        self.stop_reason = "worker_cancelled" if cancelled.is_set() else "task_budget_exhausted"
                        return None
                    try:
                        task = queue.claim(lease_seconds)
                    except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError):
                        # A lost response can hide a committed claim. Reserve its budget
                        # slot and let the unknown lease expire instead of releasing it.
                        unknown_claims += 1
                        exhausted = attempt == 3 or claimed + unknown_claims >= max_tasks
                        delay = 0.4 * (2 ** (attempt - 1))
                        report_progress(
                            "claim_transport_error",
                            attempt=attempt,
                            max_attempts=3,
                            reserved_tasks=claimed + unknown_claims,
                            unknown_claims=unknown_claims,
                            max_tasks=max_tasks,
                            retry_in_seconds=0 if exhausted else delay,
                            error_code="queue_transport_failed",
                        )
                        if exhausted:
                            raise
                    else:
                        if task is not None:
                            claimed += 1
                            report_progress(
                                "task_claimed",
                                task,
                                task_number=claimed,
                                max_tasks=max_tasks,
                                concurrency=concurrency,
                                completed_tasks=completed,
                            )
                        return task
                if cancelled.wait(delay):
                    self.stop_reason = "worker_cancelled"
                    return None
            raise AssertionError("Claim retry bound must return or raise")

        def finish(self, task: CrawlTask, result: dict[str, Any]) -> bool:
            nonlocal completed
            finished = queue.finish(task, result)
            with lock:
                if finished:
                    completed += 1
                report_progress(
                    "batch_progress",
                    task,
                    completed_tasks=completed,
                    claimed_tasks=claimed,
                    unknown_claims=unknown_claims,
                    max_tasks=max_tasks,
                    concurrency=concurrency,
                    status=result.get("status", "incomplete"),
                )
            return finished

    def drain() -> dict[str, int]:
        process = TaskProcess(task_timeout)
        with lock:
            processes.add(process)
        try:
            action = process.execute if execute is execute_task else execute
            return _run_worker_serial(BudgetQueue(), max_tasks, lease_seconds, action)
        finally:
            process.close()
            with lock:
                processes.discard(process)

    if concurrency == 1:
        return drain()
    report_progress("worker_pool_start", concurrency=concurrency, max_tasks=max_tasks, task_timeout=task_timeout)
    report_progress("batch_progress", completed_tasks=0, claimed_tasks=0, max_tasks=max_tasks, concurrency=concurrency)
    pool = ThreadPoolExecutor(max_workers=concurrency)
    try:
        results = list(pool.map(lambda _: drain(), range(concurrency)))
    except BaseException:
        cancelled.set()
        with lock:
            active = list(processes)
        for process in active:
            process.abort()
        raise
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
    return {key: sum(result[key] for result in results) for key in ("complete", "incomplete", "lease_lost")}
