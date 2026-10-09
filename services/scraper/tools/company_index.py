"""Download public snapshots and run review-only employer coverage pilots."""

from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from jobpulse_scraper.company_index.download import download_cro, download_overture, event, index_lock
from jobpulse_scraper.company_index.importers import (
    CRO_ATTRIBUTION,
    OVERTURE_ATTRIBUTION,
    checksum,
    cro_rows,
    overture_rows,
)
from jobpulse_scraper.company_index.store import CompanyIndex
from jobpulse_scraper.paths import REPO_ROOT


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["refresh", "pilot"])
    parser.add_argument("--root", type=Path, default=REPO_ROOT / ".backups" / "company-index")
    parser.add_argument("--source", choices=["cro", "overture", "both"], default="both")
    parser.add_argument("--release", default="2026-09-23.1", help="Explicit Overture snapshot release")
    parser.add_argument("--local", action="store_true", help="Import downloaded snapshots without network")
    parser.add_argument(
        "--employers", type=Path, help="JSON public employer records; otherwise read catalog identities"
    )
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--report", type=Path, help="Pilot report destination")
    parser.add_argument("--fuzzy", action="store_true", help="Review close names for otherwise unmatched employers")
    parser.add_argument(
        "--similarity-threshold", type=float, default=85, help="Name score cutoff (0–100), not an identity probability"
    )
    args = parser.parse_args()
    if not 0 <= args.similarity_threshold <= 100:
        parser.error("similarity-threshold must be 0–100")
    if not 1 <= args.limit <= 10000:
        parser.error("limit must be 1–10000")
    started = time.monotonic()
    with index_lock(args.root):
        index = CompanyIndex(args.root / "companies.sqlite3")
        try:
            if args.command == "refresh":
                for source in ("cro", "overture"):
                    if args.source not in {source, "both"}:
                        continue
                    path = args.root / ("companies.csv.zip" if source == "cro" else "overture-ireland.jsonl")
                    if not args.local:
                        path = (
                            download_cro(args.root) if source == "cro" else download_overture(args.root, args.release)
                        )
                    count = index.replace(
                        source,
                        cro_rows(path) if source == "cro" else overture_rows(path),
                        version=datetime.fromtimestamp(path.stat().st_mtime, UTC).isoformat()
                        if source == "cro"
                        else args.release,
                        sha256=checksum(path),
                        attribution=CRO_ATTRIBUTION if source == "cro" else OVERTURE_ATTRIBUTION,
                    )
                    event("snapshot_imported", source=source, records=count)
            else:
                if args.employers:
                    employers = json.loads(args.employers.read_text(encoding="utf-8"))[: args.limit]
                else:
                    from jobpulse_scraper.database.client import get_supabase, retry_supabase
                    from jobpulse_scraper.database.records import response_records

                    client = get_supabase()
                    employers = []
                    cursor = 0
                    while len(employers) < args.limit:
                        rows = response_records(
                            retry_supabase(
                                lambda cursor=cursor: (
                                    client.table("employers")
                                    .select("id,name,website")
                                    .order("id")
                                    .gt("id", cursor)
                                    .limit(min(100, args.limit - len(employers)))
                                    .execute()
                                )
                            ).data
                        )
                        if not rows:
                            break
                        employers.extend(rows)
                        cursor = rows[-1]["id"]
                if not index.metadata():
                    raise ValueError("Import a snapshot before running the pilot")
                if args.fuzzy:
                    event("fuzzy_index_preparing")
                    index.prepare_fuzzy()
                    event("fuzzy_index_ready")
                results = [
                    {
                        "employer_id": e.get("id"),
                        **index.match(
                            e["name"],
                            e.get("website") or "",
                            str(e.get("company_number") or ""),
                            fuzzy=args.fuzzy,
                            threshold=args.similarity_threshold,
                        ),
                    }
                    for e in employers
                ]
                summary = dict(Counter(r["status"] for r in results))
                report = {
                    "snapshots": index.metadata(),
                    "fuzzy_enabled": args.fuzzy,
                    "similarity_threshold": args.similarity_threshold,
                    "fuzzy_only_employers": sum(
                        any("similar_name" in c["match_reasons"] for c in r["candidates"]) for r in results
                    ),
                    "fuzzy_searches_truncated": sum(r["fuzzy_search_truncated"] for r in results),
                    "checked": len(results),
                    "summary": summary,
                    "candidate_sources": dict(Counter(c["source"] for r in results for c in r["candidates"])),
                    "candidate_kinds": dict(Counter(c["kind"] for r in results for c in r["candidates"])),
                    "unknown_country_candidates": sum(not c["country"] for r in results for c in r["candidates"]),
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "automatic_office_writes": 0,
                    "accuracy": "requires human review; candidate coverage is not match accuracy",
                    "results": results,
                }
                report_path = args.report or args.root / ("pilot-fuzzy.json" if args.fuzzy else "pilot.json")
                report_path.parent.mkdir(parents=True, exist_ok=True)
                temporary = report_path.with_suffix(".json.partial")
                temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
                temporary.replace(report_path)
                event("pilot_complete", checked=len(results), summary=summary, report=str(report_path))
        finally:
            index.close()
    event("company_index_complete", elapsed_seconds=round(time.monotonic() - started, 3))


if __name__ == "__main__":
    main()
