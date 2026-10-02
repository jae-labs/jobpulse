"""Audit and hydrate existing catalog descriptions without replacing job identities.

Dry run by default. Writes only description and refreshes its scoring vector.
Expired/blocked URLs are reported for retry, never treated as closure evidence.
"""

from __future__ import annotations

import argparse
import csv
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.client import get_supabase, retry_supabase  # noqa: E402
from database.embeddings import prepare_embeddings  # noqa: E402
from engine.description_quality import has_description_body, needs_description_repair  # noqa: E402
from engine.text_cleaner import clean_description_text  # noqa: E402
from extractors.universal import extract_universal_job_spec  # noqa: E402


class DescriptionSourceBlocked(RuntimeError):
    """The source denied posting access; its jobs remain unverified."""


def recover_description(job: dict[str, Any]) -> str | None:
    spec = extract_universal_job_spec(job["url"], job["company"], job["title"])
    if spec.get("detail_error") == "source_blocked":
        raise DescriptionSourceBlocked("Posting source denied access")
    body = clean_description_text(spec.get("description", ""), job["company"], job["title"])
    # A source can publish a complete but very short ad. Preserve that exact
    # body in the catalog; embedding preparation still enforces its 100-char gate.
    published_short = spec.get("description_origin") == "published_detail" and has_description_body(
        body, minimum_chars=1
    )
    if not has_description_body(body) and not published_short:
        return None
    return body


def _repair_one(client: Any, job: dict[str, Any], apply: bool) -> tuple[str, str | None, list[dict[str, Any]]]:
    try:
        body = recover_description(job)
    except DescriptionSourceBlocked:
        return "source_blocked", None, []
    if body is None:
        return "unresolved", None, []
    if body == job.get("description"):
        return "confirmed", body, []
    if not apply:
        return "would_update", body, []
    # Compare-and-set protects a concurrently refreshed body and URL.
    update = client.table("jobs").update({"description": body}).eq("id", job["id"]).eq("url", job["url"])
    if job.get("description") is None:
        update = update.is_("description", "null")
    else:
        update = update.eq("description", job["description"])
    saved = retry_supabase(update.execute).data or []
    return ("updated" if saved else "concurrent_change"), body, saved


def repair_descriptions(
    *,
    apply: bool = False,
    source: str | None = None,
    limit: int | None = None,
    after_id: int = 0,
    workers: int = 2,
    missing_only: bool = False,
    report: Path,
) -> dict[str, int]:
    client = get_supabase()
    counts = {
        "scanned": 0,
        "candidates": 0,
        "recovered": 0,
        "updated": 0,
        "confirmed": 0,
        "published_short": 0,
        "unresolved": 0,
        "source_blocked": 0,
        "conflicts": 0,
    }
    with report.open("w", newline="") as output, ThreadPoolExecutor(max_workers=workers) as pool:
        writer = csv.DictWriter(output, fieldnames=["id", "source", "old_chars", "new_chars", "outcome"])
        writer.writeheader()
        while limit is None or counts["candidates"] < limit:
            query = client.table("jobs").select("*").gt("id", after_id).order("id").limit(100)
            if source:
                query = query.eq("source", source)
            rows = retry_supabase(query.execute).data or []
            if not rows:
                break
            after_id = rows[-1]["id"]
            counts["scanned"] += len(rows)
            candidates = [
                job
                for job in rows
                if (
                    not has_description_body(job.get("description"))
                    if missing_only
                    else job["source"] == "WhatJobs Ireland" or needs_description_repair(job.get("description"))
                )
            ]
            if limit is not None:
                candidates = candidates[: limit - counts["candidates"]]
            persisted = []
            # Source reads and independent compare-and-set writes share the same
            # bounded pool. The HTTP client supports concurrent requests; database
            # queries are built separately per job. Embedding preparation stays serial.
            results = pool.map(lambda job: _repair_one(client, job, apply), candidates)
            for job, (outcome, body, saved) in zip(candidates, results, strict=True):
                counts["candidates"] += 1
                if outcome in {"updated", "would_update", "concurrent_change"}:
                    counts["recovered"] += 1
                if outcome == "updated":
                    persisted.extend(saved)
                    counts["updated"] += len(saved)
                elif outcome == "confirmed":
                    counts["confirmed"] += 1
                elif outcome == "concurrent_change":
                    counts["conflicts"] += 1
                elif outcome in {"unresolved", "source_blocked"}:
                    counts[outcome] += 1
                if body and not has_description_body(body):
                    counts["published_short"] += 1
                writer.writerow(
                    {
                        "id": job["id"],
                        "source": job["source"],
                        "old_chars": len(job.get("description") or ""),
                        "new_chars": len(body or ""),
                        "outcome": outcome,
                    }
                )
                output.flush()
            if persisted:
                prepare_embeddings(persisted)
            print(f"[DESCRIPTIONS] after_id={after_id} {counts}", flush=True)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--source")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--after-id", type=int, default=0)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--missing-only", action="store_true", help="Retry only bodies that fail the quality gate")
    parser.add_argument("--report", type=Path, required=True, help="CSV destination outside version control")
    args = parser.parse_args()
    if not 1 <= args.workers <= 4 or (args.limit is not None and args.limit < 1) or args.after_id < 0:
        parser.error("workers must be 1–4; limit must be positive; after-id must be non-negative")
    print(
        repair_descriptions(
            apply=args.apply,
            source=args.source,
            limit=args.limit,
            after_id=args.after_id,
            workers=args.workers,
            missing_only=args.missing_only,
            report=args.report,
        )
    )


if __name__ == "__main__":
    main()
