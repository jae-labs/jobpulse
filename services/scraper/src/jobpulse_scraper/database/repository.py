"""Supabase database repository for saving jobs, employers, and source tracking."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from jobpulse_scraper.config.loader import (
    INTEL_CAREERS_URL,
    JOBSIRELAND_URL,
    KILDARE_CAREERS_URL,
    MAYNOOTH_SEARCH_URL,
    PUBLICJOBS_URL,
    get_employers_tuples,
)
from jobpulse_scraper.database.client import get_supabase, retry_supabase, utc_now
from jobpulse_scraper.database.ingestion import (
    IngestionIncompleteError as IngestionIncompleteError,
)
from jobpulse_scraper.database.ingestion import (
    _sanitize_val,
)
from jobpulse_scraper.database.ingestion import (
    backfill_job_embeddings as backfill_job_embeddings,
)
from jobpulse_scraper.database.ingestion import (
    save_jobs_batch as save_jobs_batch,
)
from jobpulse_scraper.database.records import response_count, response_records
from jobpulse_scraper.engine.normalization import (
    canonical_job_url as canonical_job_url,
)
from jobpulse_scraper.engine.normalization import (
    normalize_company_name as normalize_company_name,
)
from jobpulse_scraper.engine.normalization import (
    normalize_job_title as normalize_job_title,
)
from jobpulse_scraper.engine.normalization import (
    normalized_key as normalized_key,
)
from jobpulse_scraper.pipeline.employer_lookup import (
    CURATED_IRISH_EMPLOYERS,
    normalize_company_key,
)


def update_source_status(
    name: str,
    status: str,
    detail: str,
    opportunities_found: int = 0,
    url: str | None = None,
    mode: str | None = None,
    *args: Any,
    **kwargs: Any,
) -> None:
    """Update status, timestamp, detail message, and opportunity count for a source in Supabase."""
    supabase = get_supabase()
    now = utc_now()
    payload: dict[str, Any] = {
        "last_status": _sanitize_val(status),
        "last_synced_at": now,
        "detail": _sanitize_val(detail),
        "opportunities_found": opportunities_found,
    }
    if url:
        payload["url"] = _sanitize_val(url)
    if mode:
        payload["mode"] = _sanitize_val(mode)

    try:
        res = retry_supabase(lambda: supabase.table("sources").update(payload).eq("name", name).execute())
        if not res.data:
            # Fallback to insert if source didn't exist
            insert_payload = {
                "name": _sanitize_val(name),
                "url": _sanitize_val(url or "https://google.com"),
                "mode": _sanitize_val(mode or "company crawler"),
                **payload,
            }
            retry_supabase(lambda: supabase.table("sources").insert(insert_payload).execute())
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Could not update source '{name}': {exc}")


def update_employer_status(
    name: str,
    status: str,
    opportunities_found: int = 0,
    discovered_jobs_url: str | None = None,
    last_scraped_at: str | None = None,
) -> None:
    """Update scraping status and discovered URL for an employer in Supabase."""
    supabase = get_supabase()
    now = last_scraped_at or utc_now()
    payload: dict[str, Any] = {
        "status": _sanitize_val(status),
        "last_scraped_at": now,
        "opportunities_found": opportunities_found,
    }
    if discovered_jobs_url:
        payload["discovered_jobs_url"] = _sanitize_val(discovered_jobs_url)

    try:
        retry_supabase(lambda: supabase.table("employers").update(payload).eq("name", name).execute())
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Could not update employer '{name}': {exc}")


def deduplicate_database_jobs() -> dict[str, Any]:
    """
    Scan all jobs in Supabase and consolidate duplicate records sharing
    the same canonical employer and title.

    Safely transfers user_job_statuses to the primary record before deleting duplicate rows.
    """
    supabase = get_supabase()
    print("  [DEDUPE] Scanning database for existing duplicates...")

    all_jobs: list[dict[str, Any]] = []
    page_size = 1000
    start = 0
    while True:
        res = retry_supabase(
            lambda s=start: (
                supabase.table("jobs")
                .select("id, title, company, location, employment_type, url, description, last_seen_at, dedupe_key")
                .range(s, s + page_size - 1)
                .execute()
            )
        )
        data = response_records(res.data)
        all_jobs.extend(data)
        if len(data) < page_size:
            break
        start += page_size

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for j in all_jobs:
        key = normalized_key(
            j.get("company", ""),
            j.get("title", ""),
            j.get("url", ""),
            j.get("location", ""),
            j.get("employment_type", ""),
        )
        groups[key].append(j)

    duplicate_groups = {k: v for k, v in groups.items() if len(v) > 1}
    if not duplicate_groups:
        print("  [DEDUPE] No duplicates found in database.")
        return {"groups": 0, "deleted_rows": 0}

    print(f"  [DEDUPE] Found {len(duplicate_groups)} duplicate group(s). Consolidating...")
    deleted_total = 0

    for job_list in duplicate_groups.values():
        sorted_jobs = sorted(job_list, key=lambda x: len(x.get("description") or ""), reverse=True)
        keeper = sorted_jobs[0]
        duplicates = sorted_jobs[1:]
        dup_ids = [d["id"] for d in duplicates]
        keeper_id = keeper["id"]

        correct_key = normalized_key(
            keeper["company"],
            keeper["title"],
            keeper.get("url", ""),
            keeper.get("location", ""),
            keeper.get("employment_type", ""),
        )
        try:
            response = retry_supabase(
                lambda keeper_id=keeper_id, dup_ids=dup_ids, correct_key=correct_key: supabase.rpc(
                    "merge_duplicate_catalog_jobs",
                    {
                        "p_keeper_id": keeper_id,
                        "p_duplicate_ids": dup_ids,
                        "p_dedupe_key": correct_key,
                    },
                ).execute()
            )
            deleted_total += response_count(response.data)
        except Exception as exc:
            print(f"  [DEDUPE] Could not merge duplicate jobs: {exc}")

    print(f"  [DEDUPE] Consolidated {len(duplicate_groups)} duplicate groups; removed {deleted_total} duplicate jobs.")
    return {"groups": len(duplicate_groups), "deleted_rows": deleted_total}


def get_employer(name: str) -> dict[str, Any] | None:
    """Fetch a single employer record from Supabase by name."""
    supabase = get_supabase()
    try:
        res = supabase.table("employers").select("*").eq("name", name).limit(1).execute()
        rows = response_records(res.data)
        return rows[0] if rows else None
    except Exception:
        return None


def sync_watchlist_metadata() -> None:
    """
    Synchronize watchlist employers and core sources from config/websites.yaml directly to Supabase.
    This serves as the single source of truth for tracking employer targets.
    """
    supabase = get_supabase()
    print("  [SUPABASE] Syncing watchlist employers and sources metadata...")

    # 1. Seed/Update Employers
    employers_tuples = get_employers_tuples()
    if employers_tuples:
        unique_employers: dict[str, dict[str, Any]] = {}
        for emp in employers_tuples:
            name = _sanitize_val(emp[0])
            if name:
                curated = CURATED_IRISH_EMPLOYERS.get(normalize_company_key(name))
                emp_dict: dict[str, Any] = {
                    "name": name,
                    "sector": _sanitize_val(emp[1]),
                    "metadata_source": "watchlist",
                    "priority": emp[2],
                    "careers_url": _sanitize_val(emp[3]),
                }
                if curated:
                    emp_dict["location"] = curated.get("location")
                    emp_dict["latitude"] = curated.get("latitude")
                    emp_dict["longitude"] = curated.get("longitude")
                    emp_dict["description"] = curated.get("description")
                    emp_dict["website"] = curated.get("website")
                unique_employers[name] = emp_dict
        employer_payloads = list(unique_employers.values())
        try:
            supabase.table("employers").upsert(employer_payloads, on_conflict="name").execute()
        except Exception as exc:
            print(f"  [SUPABASE] Warning: Failed to sync employers: {exc}")

        # 2. Register watchlist in Sources
        unique_sources: dict[str, dict[str, Any]] = {}
        for emp in employers_tuples:
            name = _sanitize_val(emp[0])
            if name:
                unique_sources[name] = {
                    "name": name,
                    "url": _sanitize_val(emp[3]),
                    "mode": "company crawler",
                }
        watchlist_sources = list(unique_sources.values())
        try:
            supabase.table("sources").upsert(watchlist_sources, on_conflict="name").execute()
        except Exception as exc:
            print(f"  [SUPABASE] Warning: Failed to sync watchlist sources: {exc}")

    # 3. Core Specialized Scrapers in Sources
    core_sources = [
        {"name": "JobsIreland.ie", "url": JOBSIRELAND_URL, "mode": "official portal"},
        {"name": "Kildare County Council", "url": KILDARE_CAREERS_URL, "mode": "official page"},
        {"name": "PublicJobs.ie", "url": PUBLICJOBS_URL, "mode": "official portal"},
        {"name": "Maynooth University", "url": MAYNOOTH_SEARCH_URL, "mode": "official portal"},
        {
            "name": "Technological University Dublin",
            "url": "https://my.corehr.com/pls/tudrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
            "mode": "official portal",
        },
        {
            "name": "Trinity College Dublin",
            "url": "https://my.corehr.com/pls/trrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
            "mode": "official portal",
        },
        {"name": "Intel Ireland", "url": INTEL_CAREERS_URL, "mode": "official portal"},
        {"name": "Kerry Group", "url": "https://jobs.kerry.com/gb/en/search-results", "mode": "official portal"},
        {
            "name": "Irish Life",
            "url": "https://life-careers.com/irishlife/go/irishlife/3805801/",
            "mode": "official portal",
        },
        {"name": "The Housing Agency", "url": "https://www.housingagency.ie/careers/", "mode": "official page"},
    ]
    try:
        supabase.table("sources").upsert(core_sources, on_conflict="name").execute()
        print("  [SUPABASE] Successfully initialized Supabase metadata.")
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Failed to sync core sources: {exc}")


def refresh_catalog_stats() -> None:
    """Refresh the shared overview facet rollup after a catalogue change."""
    try:
        get_supabase().rpc("refresh_catalog_stats").execute()
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Failed to refresh catalog stats: {exc}")


def close_stale_jobs(grace_days: int = 14) -> int:
    """Compatibility RPC: returns zero until vacancy-specific closure evidence exists."""
    try:
        result = get_supabase().rpc("close_stale_jobs", {"p_grace_days": grace_days}).execute()
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Failed to close stale jobs: {exc}")
        return 0
    data: Any = result.data
    if isinstance(data, list):
        return int(data[0]) if data else 0
    return int(data or 0)
