"""Link vacancies to verified employer identities without changing vacancy facts.

Read-only by default: uv run python tools/backfill_employers.py [--limit N]
Write explicitly:    uv run python tools/backfill_employers.py --apply [--limit N]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase, retry_supabase
from database.repository import sync_watchlist_metadata
from pipeline.employer_lookup import EmployerLookupService

logger = logging.getLogger(__name__)


def run_backfill(*, dry_run: bool = True, limit: int | None = None) -> dict[str, int]:
    """Visit each ID once, count successful CAS writes, and retain ambiguous rows."""
    if limit is not None and limit <= 0:
        raise ValueError("limit must be positive")
    client = get_supabase()
    service = EmployerLookupService(client)
    if not dry_run:
        sync_watchlist_metadata()
    counts = {"scanned": 0, "proposed": 0, "updated": 0, "unresolved": 0, "failed": 0}
    cursor: int | None = None
    while limit is None or counts["scanned"] < limit:
        size = min(500, limit - counts["scanned"]) if limit is not None else 500

        def fetch_page(size=size, cursor=cursor):
            query = client.table("jobs").select("id,company,url").is_("employer_id", "null").order("id").limit(size)
            if cursor is not None:
                query = query.gt("id", cursor)
            return query.execute()

        rows = retry_supabase(fetch_page).data or []
        if not rows:
            break
        for job in rows:
            cursor = job["id"]
            counts["scanned"] += 1
            try:
                employer = service.resolve_employer(job.get("company") or "", persist=not dry_run)
                if not employer:
                    counts["unresolved"] += 1
                    continue
                if dry_run:
                    counts["proposed"] += 1
                    continue
                if employer.get("id") is None:
                    counts["unresolved"] += 1
                    continue
                # Do not overwrite a relation established concurrently, or match a renamed company.
                result = retry_supabase(
                    lambda j=job, e=employer: (
                        client.table("jobs")
                        .update({"employer_id": e["id"]})
                        .eq("id", j["id"])
                        .eq("company", j["company"])
                        .is_("employer_id", "null")
                        .execute()
                    )
                )
                counts["updated"] += len(result.data or [])
            except Exception:
                counts["failed"] += 1
                logger.warning("Employer linking failed for catalog job %s", job["id"])
        if len(rows) < size:
            break
    # Linking display metadata is not a matching input. No generation writes or vector refresh.
    logger.info("Employer linking complete: %s", counts)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Persist employer links; otherwise read only.")
    mode.add_argument("--dry-run", action="store_true", help="Read only (the default).")
    parser.add_argument("--limit", type=int, help="Maximum vacancies scanned, including unresolved rows.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    counts = run_backfill(dry_run=not args.apply, limit=args.limit)
    if counts["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
