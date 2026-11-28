"""Enrich existing employers from reviewed evidence, including already-linked aliases.

Preview: uv run --locked python tools/enrich_employers.py --report /tmp/employers.csv
Apply:   uv run --locked python tools/enrich_employers.py --apply --report /tmp/employers.csv
Unknown identities remain unresolved. This command never writes vacancy facts or scores.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.database.client import get_supabase, retry_supabase
from jobpulse_scraper.database.records import response_records
from jobpulse_scraper.pipeline.employer_lookup import curated_employer, load_evidence_registry
from jobpulse_scraper.pipeline.stored_employer_evidence import (
    load_reviewed_evidence,
    stored_sector_evidence,
    trusted_sector_index,
)

logger = logging.getLogger(__name__)


def run_enrichment(
    *,
    dry_run: bool = True,
    limit: int | None = None,
    report: Path | None = None,
    database_only: bool = False,
    stored_evidence: Path | None = None,
    refresh_verified: bool = False,
    registry: Path | None = None,
) -> dict[str, int]:
    """Update the existing ID, not another canonical employer, with concurrency guards."""
    if limit is not None and limit <= 0:
        raise ValueError("limit must be positive")
    client = get_supabase()
    if stored_evidence is not None and not database_only:
        raise ValueError("Stored evidence requires database-only mode")
    if refresh_verified and database_only:
        raise ValueError("Refreshing verified metadata requires the reviewed external registry")
    if registry and database_only:
        raise ValueError("External registry cannot be used in database-only mode")
    external = load_evidence_registry(registry) if registry else None
    reviewed = load_reviewed_evidence(stored_evidence)
    index = trusted_sector_index(client) if database_only else {}
    counts = {"scanned": 0, "proposed": 0, "updated": 0, "unresolved": 0, "conflicts": 0, "failed": 0}
    records = []
    cursor = None
    while limit is None or counts["scanned"] < limit:
        size = min(500, limit - counts["scanned"]) if limit is not None else 500

        def fetch_page(size=size, cursor=cursor):
            query = client.table("employers").select("id,name,metadata_source").order("id").limit(size)
            query = (
                query.in_("metadata_source", ["unverified", "verified"])
                if refresh_verified
                else query.eq("metadata_source", "unverified")
            )
            if cursor is not None:
                query = query.gt("id", cursor)
            return query.execute()

        rows = response_records(retry_supabase(fetch_page).data)
        if not rows:
            break
        for employer in rows:
            cursor = employer["id"]
            counts["scanned"] += 1
            evidence = (
                stored_sector_evidence(client, employer, index, reviewed)
                if database_only
                else (
                    external.get(" ".join(employer["name"].split()).casefold())
                    if external is not None
                    else curated_employer(employer["name"])
                )
            )
            record = {"id": cursor, "name": employer["name"], "sector": "", "sources": "", "outcome": "unresolved"}
            if evidence is None:
                counts["unresolved"] += 1
                records.append(record)
                continue
            record.update(sector=evidence["sector"], sources=" | ".join(evidence.get("sources", [])))
            counts["proposed"] += 1
            if dry_run:
                record["outcome"] = "proposed"
            else:
                payload = {
                    key: evidence[key]
                    for key in ("sector", "location", "latitude", "longitude", "description", "website")
                }
                payload["metadata_source"] = evidence.get("metadata_source", "curated")
                try:
                    result = retry_supabase(
                        lambda e=employer, p=payload: (
                            client.table("employers")
                            .update(p)
                            .eq("id", e["id"])
                            .eq("name", e["name"])
                            .eq("metadata_source", e.get("metadata_source", "unverified"))
                            .execute()
                        )
                    )
                    changed = len(response_records(result.data))
                    counts["updated" if changed else "conflicts"] += 1
                    record["outcome"] = "updated" if changed else "conflict"
                except Exception:
                    counts["failed"] += 1
                    record["outcome"] = "failed"
                    logger.warning("Employer metadata write failed for catalog employer %s", cursor)
            records.append(record)
        if len(rows) < size:
            break
    if report is not None:
        report.parent.mkdir(parents=True, exist_ok=True)
        with report.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["id", "name", "sector", "sources", "outcome"])
            writer.writeheader()
            writer.writerows(records)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Persist reviewed metadata; otherwise read only.")
    mode.add_argument("--dry-run", action="store_true", help="Read only (the default).")
    parser.add_argument("--limit", type=int, help="Maximum employers scanned, including unresolved identities.")
    parser.add_argument("--report", type=Path, help="Write a public employer evidence and outcome CSV.")
    parser.add_argument(
        "--registry", type=Path, help="Explicit reviewed employer evidence registry; no fallback guesses."
    )
    parser.add_argument(
        "--database-only", action="store_true", help="Use existing trusted sectors and reviewed stored bodies only."
    )
    parser.add_argument(
        "--stored-evidence", type=Path, help="Reviewed posting witnesses with employer names, sectors and body hashes."
    )
    parser.add_argument(
        "--refresh-verified",
        action="store_true",
        help="Also complete previously database-verified metadata using exact reviewed registry identities.",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    counts = run_enrichment(
        dry_run=not args.apply,
        limit=args.limit,
        report=args.report,
        database_only=args.database_only,
        stored_evidence=args.stored_evidence,
        refresh_verified=args.refresh_verified,
        registry=args.registry,
    )
    print(json.dumps(counts, sort_keys=True))
    if counts["failed"] or counts["conflicts"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
