"""Research stored JobsIreland/WhatJobs employers without visiting either job board.

Writes a review report only. Geoapify requires GEOAPIFY_API_KEY. Address evidence
comes from the reviewed company registry, never from the vacancy's city.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from supabase import Client

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase, retry_supabase
from database.records import response_records
from pipeline.company_research import BLOCKED_NAMES, ResearchClient, ResearchError
from pipeline.employer_lookup import load_evidence_registry

SOURCES = {"jobsireland": "JobsIreland.ie", "whatjobs": "WhatJobs Ireland"}


def catalog_employers(client: Client, sources: list[str]) -> dict[int, dict[str, Any]]:
    """Keyset paging avoids REST limits and researches a shared employer once."""
    employers: dict[int, dict[str, Any]] = {}
    cursor = None
    while True:
        query = client.table("jobs").select("id,employer_id,source").order("id").limit(500)
        if sources:
            query = query.in_("source", sources)
        if cursor is not None:
            query = query.gt("id", cursor)
        rows = response_records(retry_supabase(query.execute).data)
        for row in rows:
            if row["employer_id"] is not None:
                item = employers.setdefault(row["employer_id"], {"job_count": 0, "job_sources": []})
                item["job_count"] += 1
                if row["source"] not in item["job_sources"]:
                    item["job_sources"].append(row["source"])
        if len(rows) < 500:
            break
        cursor = rows[-1]["id"]
    ids = sorted(employers)
    for start in range(0, len(ids), 200):
        rows = response_records(
            retry_supabase(
                lambda start=start: (
                    client.table("employers")
                    .select("id,name,metadata_source")
                    .in_("id", ids[start : start + 200])
                    .execute()
                )
            ).data
        )
        for row in rows:
            employers[row["id"]].update(row)
    return {identity: row for identity, row in employers.items() if "name" in row}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=["both", "all", *SOURCES], default="both")
    parser.add_argument("--limit", type=int, default=50, help="Maximum companies, including unresolved ones")
    parser.add_argument("--unknown-only", action="store_true", help="Research unverified employers only")
    parser.add_argument("--company", help="Exact stored company name for a targeted check")
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=Path("../../.backups/employer-research-cache"))
    parser.add_argument("--registry", type=Path, help="Reviewed official website/address evidence registry")
    parser.add_argument("--geocode", action="store_true", help="Geocode documented company addresses with Geoapify")
    args = parser.parse_args()
    if args.limit <= 0:
        parser.error("--limit must be positive")
    client = get_supabase()  # Also loads the backend .env; credentials never enter reports.
    api_key = os.environ.get("GEOAPIFY_API_KEY", "")
    if args.geocode and not api_key:
        parser.error("Set GEOAPIFY_API_KEY in the backend environment before using --geocode")
    employers = catalog_employers(
        client,
        [] if args.source == "all" else (list(SOURCES.values()) if args.source == "both" else [SOURCES[args.source]]),
    )
    evidence = load_evidence_registry(args.registry)
    report: dict[str, Any] = {"checked_on": datetime.now(timezone.utc).isoformat(), "companies": [], "writes": 0}
    failures = 0
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(
        timeout=20, headers={"User-Agent": "JobPulseEmployerResearch/1.0 (+https://github.com/jae-labs/jobpulse)"}
    ) as http:
        researcher = ResearchClient(args.cache, http)
        for employer in sorted(employers.values(), key=lambda e: (-e["job_count"], e["id"])):
            if args.unknown_only and employer["metadata_source"] != "unverified":
                continue
            if args.company and employer["name"].casefold() != args.company.casefold():
                continue
            if len(report["companies"]) >= args.limit:
                break
            item = {**employer, "approved": False}
            try:
                name = " ".join(employer["name"].casefold().split())
                reviewed = evidence.get(name)
                if name in BLOCKED_NAMES:
                    item["outcome"] = "platform_or_placeholder"
                elif reviewed:
                    item.update(outcome="reviewed_registry", proposal=reviewed)
                    if args.geocode and reviewed.get("location"):
                        item["geocoding"] = researcher.geocode(reviewed["location"], api_key)
                else:
                    item.update(researcher.company(employer["name"]))
                    addresses = item.get("address_candidates", [])
                    item["geocoding"] = (
                        researcher.geocode(addresses[0], api_key)
                        if args.geocode and len(addresses) == 1
                        else {"outcome": "needs_documented_company_address"}
                    )
            except ResearchError as error:
                failures += 1
                item.update(outcome="provider_failed", error=str(error))
            report["companies"].append(item)
            # Persist progress on each company so interruption does not lose work.
            temporary = args.report.with_suffix(".tmp")
            temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
            temporary.replace(args.report)
            if failures >= 5:
                break
            print(f"Checked {len(report['companies'])} companies; provider failures: {failures}", flush=True)
    if not report["companies"]:
        args.report.write_text(json.dumps(report, indent=2) + "\n")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
