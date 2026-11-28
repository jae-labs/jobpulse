"""Pure posting evidence and bounded verification never delete candidate history."""

from __future__ import annotations

import json
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from multiprocessing.connection import Connection
from typing import Any

from jobpulse_scraper.database.client import get_supabase
from jobpulse_scraper.database.records import response_records
from jobpulse_scraper.network.experience import source_scope
from jobpulse_scraper.network.posting_transport import PostingTransport
from jobpulse_scraper.paths import REPO_ROOT
from jobpulse_scraper.runtime.process_execution import TaskProcess
from jobpulse_scraper.scrapers.parsers.availability import AvailabilityResult, Probe
from jobpulse_scraper.scrapers.parsers.availability import parse_availability as parse_availability


def _probe_process(connection: Connection) -> None:
    if os.name == "posix":
        os.setsid()
    try:
        while (payload := connection.recv()) is not None:
            job = Probe.model_validate(payload)
            try:
                with source_scope("availability", job.url):
                    result = parse_availability(job, PostingTransport().fetch(job.url))
            except Exception:
                result = AvailabilityResult(state="unverified", evidence="acquisition_failed")
            connection.send(result.model_dump())
    except (EOFError, BrokenPipeError):
        pass
    finally:
        connection.close()


def verify_availability(*, apply: bool = False, limit: int = 10, concurrency: int = 2) -> dict[str, int]:
    if not 1 <= limit <= 50 or not 1 <= concurrency <= 4:
        raise ValueError("Verification accepts 1-50 tasks and 1-4 concurrent slots")
    run_started = time.monotonic()
    client = get_supabase()
    due = (datetime.now(UTC) - timedelta(hours=24)).isoformat()
    rows = response_records(
        client.table("jobs")
        .select("id,title,url")
        .neq("availability_status", "closed")
        .or_(f"availability_checked_at.is.null,availability_checked_at.lte.{due}")
        .order("availability_checked_at", nullsfirst=True)
        .order("id")
        .limit(limit)
        .execute()
        .data
    )
    slots = [TaskProcess(20, entrypoint=_probe_process) for _ in range(concurrency)]
    records: list[dict[str, Any]] = []
    counts = {
        "checked": 0,
        "active_observations": 0,
        "closed": 0,
        "unverified": 0,
        "updated": 0,
        "conflicts": 0,
        "activation_skipped": 0,
    }

    def check(row: dict[str, Any], slot: TaskProcess) -> tuple[dict[str, Any], AvailabilityResult, float]:
        began = time.monotonic()
        result = slot.execute(Probe.model_validate(row))
        if result.get("error_code"):
            outcome = AvailabilityResult(
                state="unverified",
                evidence="deadline_exceeded"
                if result["error_code"] == "task_deadline_exceeded"
                else "acquisition_failed",
            )
        else:
            outcome = AvailabilityResult.model_validate(result)
        return row, outcome, time.monotonic() - began

    try:
        # At most one queued probe per slot; deadlines do not block unrelated workers.
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            iterator = iter(rows)
            futures = {
                pool.submit(check, row, slot): slot for slot in slots if (row := next(iterator, None)) is not None
            }
            while futures:
                future = next(as_completed(futures))
                slot = futures.pop(future)
                row, result, elapsed = future.result()
                counts["checked"] += 1
                counts["active_observations" if result.state == "active" else result.state] += 1
                counts[result.evidence] = counts.get(result.evidence, 0) + 1
                records.append({"job_id": row["id"], **result.model_dump(), "elapsed_seconds": round(elapsed, 3)})
                if apply and result.state == "active":
                    counts["activation_skipped"] += 1
                if apply and result.state != "active":
                    updated = (
                        client.rpc(
                            "record_job_availability",
                            {
                                "p_job_id": row["id"],
                                "p_expected_url": row["url"],
                                "p_expected_title": row["title"],
                                "p_status": result.state,
                                "p_evidence": result.evidence,
                            },
                        )
                        .execute()
                        .data
                    )
                    counts["updated" if updated else "conflicts"] += 1
                print(
                    json.dumps(
                        {
                            "availability_event": "checked",
                            "job_id": row["id"],
                            **result.model_dump(),
                            "elapsed_seconds": round(elapsed, 3),
                            "apply": apply,
                            "activation_skipped": result.state == "active",
                        }
                    ),
                    flush=True,
                )
                row = next(iterator, None)
                if row is not None:
                    futures[pool.submit(check, row, slot)] = slot
    finally:
        for slot in slots:
            slot.close()
        directory = REPO_ROOT / "logs"
        directory.mkdir(parents=True, exist_ok=True)
        descriptor, filename = tempfile.mkstemp(prefix="availability-report-", suffix=".json", dir=directory)
        with os.fdopen(descriptor, "w") as output:
            json.dump(
                {
                    "generated_at": datetime.now(UTC).isoformat(),
                    "elapsed_seconds": round(time.monotonic() - run_started, 3),
                    "apply": apply,
                    "limit": limit,
                    "concurrency": concurrency,
                    "counts": counts,
                    "postings": records,
                },
                output,
                indent=2,
            )
        print(json.dumps({"availability_report": filename}), flush=True)
    return counts
