"""Backfill employers, sectors, locations, and coordinates for existing catalog jobs.

Links existing vacancies in the `jobs` table to their corresponding `employers` records,
populates latitude, longitude, and enriched location, and advances the catalog scoring
generation so that candidate shortlists reflect updated employer sectors.

Usage:
    uv run python tools/backfill_employers.py [--dry-run] [--limit N]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

# Ensure services/scraper directory is on python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase, retry_supabase
from database.repository import sync_watchlist_metadata
from engine.text_cleaner import WORK_MODE_TAGS, normalize_location
from pipeline.employer_lookup import (
    EmployerLookupService,
    normalize_company_key,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backfill_employers")


def load_employers_cache(supabase: Any) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Load existing employers into memory maps for rapid local matching."""
    by_exact: dict[str, dict[str, Any]] = {}
    by_norm: dict[str, dict[str, Any]] = {}

    start = 0
    page_size = 1000
    while True:
        res = retry_supabase(
            lambda s=start, p=page_size: (
                supabase.table("employers")
                .select("id, name, sector, location, latitude, longitude")
                .range(s, s + p - 1)
                .execute()
            )
        )
        for emp in res.data or []:
            name = (emp.get("name") or "").strip()
            if name:
                by_exact[name.lower()] = emp
                k = normalize_company_key(name)
                if k and k not in by_norm:
                    by_norm[k] = emp
        if len(res.data or []) < page_size:
            break
        start += page_size

    logger.info("Loaded %d employers into memory index (%d unique normalized keys).", len(by_exact), len(by_norm))
    return by_exact, by_norm


def run_backfill(*, dry_run: bool = False, limit: int | None = None) -> None:
    supabase = get_supabase()

    # Step 1: Ensure watchlist employers and curated anchors are synced in the DB
    logger.info("Step 1: Synchronizing watchlist employers and curated metadata...")
    if not dry_run:
        sync_watchlist_metadata()
    else:
        logger.info("[Dry Run] Skipping sync_watchlist_metadata upsert.")

    # Step 2: Index employers
    logger.info("Step 2: Building employer lookup cache...")
    by_exact, by_norm = load_employers_cache(supabase)
    lookup_service = EmployerLookupService()

    # Step 3: Fetch jobs requiring backfill
    logger.info("Step 3: Finding vacancies with unlinked employer...")
    total_unlinked_res = retry_supabase(
        lambda: supabase.table("jobs").select("id", count="exact").is_("employer_id", "null").limit(1).execute()
    )
    total_unlinked = total_unlinked_res.count or 0
    logger.info("Found %d vacancies with employer_id IS NULL.", total_unlinked)

    if total_unlinked == 0:
        logger.info("All jobs already have linked employers. Nothing to backfill.")
        return

    # Process in batches
    batch_size = 500
    start = 0
    updated_count = 0
    resolved_new_employers = 0

    while True:
        max_to_fetch = batch_size
        if limit is not None:
            remaining = limit - updated_count
            if remaining <= 0:
                break
            max_to_fetch = min(batch_size, remaining)

        res = retry_supabase(
            lambda m=max_to_fetch: (
                supabase.table("jobs")
                .select("id, company, location, latitude, longitude, url")
                .is_("employer_id", "null")
                .range(0, m - 1)
                .execute()
            )
        )
        jobs = res.data or []
        if not jobs:
            break

        for job in jobs:
            job_id = job["id"]
            company_raw = (job.get("company") or "").strip()
            if not company_raw:
                continue

            company_lower = company_raw.lower()
            norm_k = normalize_company_key(company_raw)

            # 1. Check in-memory exact match
            employer = by_exact.get(company_lower)

            # 2. Check in-memory normalized key
            if not employer and norm_k:
                employer = by_norm.get(norm_k)

            # 3. Check substring anchor match
            if not employer and norm_k:
                for k, emp in by_norm.items():
                    if k == norm_k or (len(k) >= 5 and k in norm_k) or (len(norm_k) >= 5 and norm_k in k):
                        employer = emp
                        break

            # 4. Resolve via lookup service (curated registry -> DB -> Wikidata/Nominatim)
            if not employer:
                try:
                    employer = lookup_service.resolve_employer(
                        company_raw,
                        careers_url=job.get("url") or "",
                        scraped_location=job.get("location") or "",
                    )
                    if employer:
                        resolved_new_employers += 1
                        by_exact[company_lower] = employer
                        if norm_k:
                            by_norm[norm_k] = employer
                except Exception as exc:
                    logger.debug("Failed to resolve employer '%s': %s", company_raw, exc)

            if not employer:
                continue

            # Compute updates
            emp_id = employer.get("id")
            emp_lat = employer.get("latitude")
            emp_lon = employer.get("longitude")
            emp_loc = employer.get("location")

            update_payload: dict[str, Any] = {"employer_id": emp_id}
            if job.get("latitude") is None and emp_lat is not None:
                update_payload["latitude"] = emp_lat
            if job.get("longitude") is None and emp_lon is not None:
                update_payload["longitude"] = emp_lon

            # Enrich vague location if employer has a specific location
            norm_loc = normalize_location(job.get("location", ""))
            if (
                norm_loc in ("Ireland", "Ireland (Hybrid)", "Ireland (Remote)", "Ireland (On-site)")
                and emp_loc
                and emp_loc != "Ireland"
            ):
                work_mode = next(
                    (label for key, label in WORK_MODE_TAGS.items() if key in (job.get("location", "")).lower()),
                    None,
                )
                if work_mode and work_mode not in emp_loc:
                    enriched_loc = f"{emp_loc} ({work_mode})"
                else:
                    enriched_loc = emp_loc
                update_payload["location"] = enriched_loc

            if dry_run:
                logger.debug(
                    "[Dry Run] Would update job #%d (%s) -> employer %s", job_id, company_raw, employer.get("name")
                )
            else:
                try:
                    retry_supabase(
                        lambda p=update_payload, j=job_id: supabase.table("jobs").update(p).eq("id", j).execute()
                    )
                except Exception as update_err:
                    logger.warning("Failed to update job #%d: %s", job_id, update_err)

            updated_count += 1
            if updated_count % 100 == 0:
                logger.info(
                    "Processed %d jobs (new employers discovered: %d)...", updated_count, resolved_new_employers
                )

        start += len(jobs)
        if len(jobs) < max_to_fetch:
            break

    logger.info("Backfill complete. Updated %d jobs with linked employers.", updated_count)

    # Step 4: Advance candidate scoring generation so candidate shortlists recompute domains
    if not dry_run and updated_count > 0:
        logger.info("Step 4: Advancing scoring_catalog_generation...")
        try:
            curr = retry_supabase(
                lambda: supabase.table("scoring_catalog_generation").select("generation").eq("id", True).execute()
            ).data
            if curr:
                new_gen = curr[0]["generation"] + 1
                retry_supabase(
                    lambda g=new_gen: (
                        supabase.table("scoring_catalog_generation").update({"generation": g}).eq("id", True).execute()
                    )
                )
                logger.info("Advanced scoring catalog generation to %d", new_gen)
        except Exception as exc:
            logger.warning("Could not advance scoring generation: %s", exc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill employers and geocoordinates for jobs.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate lookup and updates without writing to DB.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of vacancies to process.")
    args = parser.parse_args()

    try:
        run_backfill(dry_run=args.dry_run, limit=args.limit)
    except KeyboardInterrupt:
        logger.info("Backfill interrupted by user.")
        sys.exit(0)
    except Exception as exc:
        logger.exception("Backfill failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
