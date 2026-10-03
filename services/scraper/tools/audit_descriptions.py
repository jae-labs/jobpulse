"""Read-only catalog coverage audit; body heuristics do not prove source completeness."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.client import get_supabase, retry_supabase  # noqa: E402
from database.embeddings import job_scoring_hash  # noqa: E402
from database.records import response_records
from engine.description_quality import has_description_body  # noqa: E402
from engine.embeddings import EMBEDDING_MODEL_VERSION  # noqa: E402


def audit_descriptions(*, report: Path, summary: Path, repair_reports: list[Path]) -> dict:
    confirmed = set()
    for path in repair_reports:
        with path.open(newline="") as input_file:
            confirmed.update(
                int(row["id"]) for row in csv.DictReader(input_file) if row["outcome"] in {"updated", "confirmed"}
            )
    client = get_supabase()
    counts = Counter()
    sources = defaultdict(Counter)
    last_id = 0
    fields = ["id", "source", "title", "description_chars", "body_check", "detail_status", "vector_status", "url"]
    with report.open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        while True:
            jobs = response_records(
                retry_supabase(
                    lambda current_id=last_id: (
                        client.table("jobs").select("*").gt("id", current_id).order("id").limit(500).execute()
                    )
                ).data
            )
            if not jobs:
                break
            last_id = jobs[-1]["id"]
            vectors = response_records(
                retry_supabase(
                    lambda current_jobs=jobs: (
                        client.table("job_scoring_embeddings")
                        .select("job_id,content_hash,model_version")
                        .in_("job_id", [job["id"] for job in current_jobs])
                        .execute()
                    )
                ).data
            )
            by_id = {vector["job_id"]: vector for vector in vectors}
            for job in jobs:
                body = has_description_body(job.get("description"))
                vector = by_id.get(job["id"])
                vector_state = "withdrawn" if not vector and not body else "missing"
                if vector:
                    vector_state = (
                        "current"
                        if body
                        and vector["content_hash"] == job_scoring_hash(job)
                        and vector["model_version"] == EMBEDDING_MODEL_VERSION
                        else "stale_or_invalid"
                    )
                published_short = job["id"] in confirmed and not body and len(job.get("description") or "") < 100
                detail_state = (
                    "published_short"
                    if published_short
                    else "unverified_feed"
                    if job["source"] == "WhatJobs Ireland" and job["id"] not in confirmed
                    else "body_present"
                    if body
                    else "missing_body"
                )
                counts["total"] += 1
                counts["body_present" if body else "missing_body"] += 1
                counts[vector_state + "_vectors"] += 1
                counts["published_short"] += int(published_short)
                counts["unverified_feed"] += int(detail_state == "unverified_feed")
                source = sources[job["source"]]
                source["total"] += 1
                source["missing_body"] += int(not body)
                source["published_short"] += int(published_short)
                source["unverified_feed"] += int(detail_state == "unverified_feed")
                writer.writerow(
                    {
                        "id": job["id"],
                        "source": job["source"],
                        "title": job["title"],
                        "description_chars": len(job.get("description") or ""),
                        "body_check": "passed" if body else "rejected",
                        "detail_status": detail_state,
                        "vector_status": vector_state,
                        "url": job["url"],
                    }
                )
    result = {"counts": dict(counts), "sources": {source: dict(values) for source, values in sources.items()}}
    summary.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--repair-report", type=Path, action="append", default=[])
    args = parser.parse_args()
    result = audit_descriptions(report=args.report, summary=args.summary, repair_reports=args.repair_report)
    print(json.dumps(result["counts"], indent=2))
    if result["counts"].get("stale_or_invalid_vectors") or result["counts"].get("missing_vectors"):
        raise SystemExit("Job vectors are not synchronized with eligible stored descriptions")


if __name__ == "__main__":
    main()
