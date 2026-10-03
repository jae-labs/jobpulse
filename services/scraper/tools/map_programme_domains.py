"""Map explicitly named JobsIreland CE sponsors to the Community Employment domain.

Every linked vacancy must be a CE Scheme naming that exact sponsor. This establishes
programme sponsorship, not the sponsor's legal industry or an employer address.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.client import get_supabase, retry_supabase
from database.records import response_records
from pipeline.company_research import BLOCKED_NAMES


def programme_sponsor(name: str, jobs: list[dict]) -> bool:
    key = " ".join(name.casefold().split())
    return (
        bool(jobs)
        and key not in BLOCKED_NAMES
        and all(
            j["source"] == "JobsIreland.ie"
            and " ".join(j["company"].casefold().split()) == key
            and re.search(r"\bCE Scheme\b", j["title"], re.I)
            and j["title"].strip().casefold().endswith(name.strip().casefold())
            for j in jobs
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    client = get_supabase()
    employers = []
    cursor = None
    while True:
        query = (
            client.table("employers")
            .select("id,name,metadata_source")
            .eq("metadata_source", "unverified")
            .order("id")
            .limit(500)
        )
        if cursor is not None:
            query = query.gt("id", cursor)
        rows = response_records(retry_supabase(query.execute).data)
        employers.extend(rows)
        if len(rows) < 500:
            break
        cursor = rows[-1]["id"]
    outcomes = []
    for employer in employers:
        jobs, cursor = [], None
        while True:
            query = (
                client.table("jobs")
                .select("id,title,company,source")
                .eq("employer_id", employer["id"])
                .order("id")
                .limit(500)
            )
            if cursor is not None:
                query = query.gt("id", cursor)
            rows = response_records(retry_supabase(query.execute).data)
            jobs.extend(rows)
            if len(rows) < 500:
                break
            cursor = rows[-1]["id"]
        if not programme_sponsor(employer["name"], jobs):
            continue
        item = {**employer, "job_ids": [j["id"] for j in jobs], "outcome": "proposed"}
        if args.apply:
            payload = {
                "sector": "Community Employment & Training",
                "metadata_source": "verified",
                "description": "Named sponsor of Community Employment programme vacancies published by JobsIreland.",
                "location": None,
                "latitude": None,
                "longitude": None,
                "website": None,
            }
            result = retry_supabase(
                lambda employer=employer, payload=payload: (
                    client.table("employers")
                    .update(payload)
                    .eq("id", employer["id"])
                    .eq("name", employer["name"])
                    .eq("metadata_source", "unverified")
                    .execute()
                )
            )
            item["outcome"] = "updated" if result.data else "conflict"
        outcomes.append(item)
        args.report.write_text(json.dumps(outcomes, indent=2) + "\n")
    print(
        json.dumps({"employers": len(outcomes), "jobs": sum(len(o["job_ids"]) for o in outcomes), "apply": args.apply})
    )
    if any(o["outcome"] == "conflict" for o in outcomes):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
