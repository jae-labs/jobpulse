"""Bounded source reports compare measured runs without inventing missing evidence."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from jobpulse_scraper.database.client import get_supabase
from jobpulse_scraper.database.records import response_records


def remediation(code: str) -> str:
    """Recommend evidence gathering; never trigger retries or invent source fixes."""
    if code == "published_body_unavailable":
        return "Verify vacancy reference and published detail body; replay parser fixtures and preserve concise text."
    if code == "source_payload_invalid":
        return "Verify ATS tenant and payload schema; add malformed-payload and complete-pagination fixtures."
    if code in {"unsupported", "failed", "source_acquisition_failed"}:
        return "Verify first-party careers destination; configure its adapter or add a focused listing/detail parser."
    if code in {"task_deadline_exceeded", "source_response_budget_exceeded"}:
        return "Inspect page timings and sizes; use supported filters and resumable pagination within existing limits."
    if code in {"source_http_failed", "source_dns_failed", "source_connection_timeout"}:
        return "Check public route and HTTP status; repair retired destinations or retain transient-outage backoff."
    if code in {"blocked", "auth_wall", "source_http_denial", "source_content_challenge", "source_cooldown"}:
        return "Respect cooldown/authentication/challenge; stop requests and verify an authorized public alternative."
    return "Inspect bounded source evidence and add a regression fixture before a scheduled retry."


def summarize_runs(rows: list[dict[str, Any]]) -> dict[str, Any]:
    sources: dict[str, dict[str, Any]] = {}
    for row in rows:
        task = row.get("crawl_tasks") or {}
        key = task.get("source_key", "unknown")
        target = task.get("target") or {}
        source = sources.setdefault(
            key,
            {
                "source_key": key,
                "company": target.get("employer"),
                "kind": target.get("kind", "source"),
                "provider": target.get("provider"),
                "runs": 0,
                "complete": 0,
                "measured_runs": 0,
                "elapsed_seconds": 0.0,
                "requests_sent": 0,
                "denials": 0,
                "opportunities_found": 0,
                "persisted": 0,
                "quality": {},
                "failure_codes": {},
                "stage_seconds": {},
                "latest_measurements": [],
            },
        )
        source["runs"] += 1
        source["complete"] += row["status"] == "complete"
        result = row.get("result") or {}
        if row["status"] != "complete":
            code = result.get("error_code") or row["status"]
            source["failure_codes"][code] = source["failure_codes"].get(code, 0) + 1
        source["opportunities_found"] += result.get("found", 0)
        source["persisted"] += result.get("persisted", 0)
        metrics = result.get("acquisition_metrics")
        if not isinstance(metrics, dict):
            continue
        source["measured_runs"] += 1
        for field in ("elapsed_seconds", "requests_sent", "denials"):
            source[field] += metrics.get(field, 0)
        for field, count in metrics.get("quality", {}).items():
            source["quality"][field] = source["quality"].get(field, 0) + count
        for stage, duration in metrics.get("stage_seconds", {}).items():
            source["stage_seconds"][stage] = round(source["stage_seconds"].get(stage, 0) + duration, 4)
        if len(source["latest_measurements"]) < 2:
            source["latest_measurements"].append(
                {
                    "started_at": row.get("started_at"),
                    "status": row["status"],
                    "error_code": result.get("error_code"),
                    "http_status": result.get("http_status"),
                    "found": result.get("found"),
                    "persisted": result.get("persisted"),
                    **metrics,
                }
            )
    for source in sources.values():
        count, seconds = source["measured_runs"], source["elapsed_seconds"]
        source["average_seconds"] = round(seconds / count, 3) if count else None
        source["requests_per_second"] = round(source["requests_sent"] / seconds, 4) if seconds else None
        source["unmeasured_runs"] = source["runs"] - count
        source["recommended_actions"] = {code: remediation(code) for code in source["failure_codes"]}
        latest = source["latest_measurements"]
        source["latest_duration_change_seconds"] = (
            round(latest[0]["elapsed_seconds"] - latest[1]["elapsed_seconds"], 3) if len(latest) == 2 else None
        )
        assessed = source["quality"].get("opportunities_assessed", 0)
        source["description_body_coverage"] = (
            source["quality"].get("description_body_present", 0) / assessed if assessed else None
        )
    return {
        "runs_in_window": len(rows),
        "window_limit": 100,
        "quota_established": False,
        "stage_timing_semantics": "Inclusive, overlapping worker durations; do not sum stages as wall time.",
        "sources": sorted(sources.values(), key=lambda row: row["elapsed_seconds"], reverse=True),
    }


def crawl_report(company: str | None = None) -> dict[str, Any]:
    query = (
        get_supabase()
        .table("crawl_runs")
        .select("status,result,started_at,crawl_tasks!inner(source_key,target)")
        .neq("status", "running")
        .order("started_at", desc=True)
        .limit(100)
    )
    if company:
        query = query.eq("crawl_tasks.target->>employer", company)
    report = summarize_runs(response_records(query.execute().data))
    report["generated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    return report


def save_crawl_report(directory: Path | None = None) -> dict[str, Any]:
    """Archive a routine post-drain report; preserve the crawl's own outcome separately."""
    from jobpulse_scraper.paths import REPO_ROOT

    report = crawl_report()
    directory = directory or REPO_ROOT / "logs"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, filename = tempfile.mkstemp(prefix="crawl-report-", suffix=".json", dir=directory)
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(report, output, indent=2)
            output.write("\n")
    except BaseException:
        Path(filename).unlink(missing_ok=True)
        raise
    sources = report["sources"]
    return {
        "crawl_report": filename,
        "runs_in_window": report["runs_in_window"],
        "window_measured_runs": sum(source["measured_runs"] for source in sources),
        "window_incomplete_runs": sum(source["runs"] - source["complete"] for source in sources),
        "window_requests_sent": sum(source["requests_sent"] for source in sources),
        "window_denials": sum(source["denials"] for source in sources),
    }
