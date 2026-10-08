"""Bounded durable workers with renewal, retry history and fenced catalog writes."""

from __future__ import annotations

import hashlib
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlsplit

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
from jobpulse_scraper.network.ledger import RequestLedger, source_key
from jobpulse_scraper.network.recording import RecordingTransport
from jobpulse_scraper.network.request_policy import STATE_PATH, HostCoolingDown, retry_after_seconds
from jobpulse_scraper.network.transport import BrowserTransport, HttpTransport
from jobpulse_scraper.paths import STATE_ROOT
from jobpulse_scraper.pipeline.detail_enrichment import enrich_job
from jobpulse_scraper.pipeline.runner import synchronize
from jobpulse_scraper.runtime.lease import Lease, active_lease, active_snapshot
from jobpulse_scraper.scrapers.adapters import ADAPTERS
from jobpulse_scraper.snapshots import PARSER_VERSION, SnapshotStore, public_url


class CrawlTask(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    source_key: str
    target: dict[str, Any]
    lease_token: str
    attempt: int = Field(ge=1)


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
        return response_count(get_supabase().rpc("enqueue_crawls_if_idle", {"p_targets": targets}).execute().data)

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
    kind = task.target.get("kind")
    if kind in {"detail", "vector"}:
        job_id = task.target.get("job_id")
        if not isinstance(job_id, int) or isinstance(job_id, bool):
            raise ValueError("Enrichment requires a catalog job identity")
        rows = response_records(get_supabase().table("jobs").select("*").eq("id", job_id).limit(1).execute().data)
        if not rows:
            return {"status": "complete", "removed_job": True}
        job = rows[0]
        if kind == "detail":
            enriched = enrich_job(job)
            if not has_description_body(enriched.get("description")):
                return {"status": "incomplete", "error_code": "published_body_unavailable"}
            return {"status": "complete", "persisted": save_jobs_batch([enriched], enrich=False)}
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
    if provider in ADAPTERS and isinstance(url, str):
        target = SourceTarget(provider, employer, url, identifier)
        adapter = ADAPTERS[provider]
        snapshots: list[str] = []
        found = persisted = 0

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
            for _, jobs in adapter.pages(target, transport):
                found += len(jobs)
                persisted += save_jobs_batch([job.as_record() for job in jobs])
        except IngestionIncompleteError as error:
            raise IngestionIncompleteError(persisted + error.persisted, error.failed, error.vectors_pending) from error
        except Exception as error:
            status, error_code = "incomplete", "source_acquisition_failed"
            details: dict[str, Any] = {}
            if isinstance(error, ResponseBudgetExceeded):
                error_code = "source_response_budget_exceeded"
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
    result = sync_single_employer(employer, url, record_health=False)
    complete = result.outcome in {ScrapeOutcome.SYNCED, ScrapeOutcome.EMPTY}
    return {
        "status": "complete" if complete else "blocked" if result.outcome == ScrapeOutcome.BLOCKED else "incomplete",
        "found": result.opportunities_found,
        "persisted": result.added,
        "failed_writes": result.failed_writes,
        "vectors_pending": result.vectors_pending,
        "error_code": None if complete else result.outcome.value,
    }


def run_worker(
    queue: CrawlQueue,
    max_tasks: int = 20,
    lease_seconds: int = 120,
    execute: Callable[[CrawlTask], dict[str, Any]] = execute_task,
) -> dict[str, int]:
    if not 1 <= max_tasks <= MAX_WORKER_TASKS or not 10 <= lease_seconds <= 3600:
        raise ValueError("Worker task and lease bounds are invalid")
    queue.purge_history()
    counts = {"complete": 0, "incomplete": 0, "lease_lost": 0}
    for _ in range(max_tasks):
        task = queue.claim(lease_seconds)
        if task is None:
            break
        stopped = threading.Event()
        lost = threading.Event()

        def heartbeat(
            current: CrawlTask = task, stop: threading.Event = stopped, failure: threading.Event = lost
        ) -> None:
            while not stop.wait(lease_seconds / 3):
                try:
                    if not queue.renew(current, lease_seconds):
                        failure.set()
                        return
                except Exception:
                    failure.set()
                    return

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        snapshot_token = active_snapshot.set(None)
        source_token = source_key.set(task.source_key)
        context_token = active_lease.set(Lease(task.id, task.lease_token))
        try:
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
            if lost.is_set() or not queue.finish(task, result):
                counts["lease_lost"] += 1
            else:
                counts["complete" if result.get("status") == "complete" else "incomplete"] += 1
                queue.record_outcome(task, result)
        finally:
            active_lease.reset(context_token)
            source_key.reset(source_token)
            active_snapshot.reset(snapshot_token)
            stopped.set()
            thread.join()
    return counts
