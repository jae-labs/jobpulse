"""Supabase database repository for saving jobs, employers, and source tracking."""

from __future__ import annotations

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


def deduplicate_database_jobs(*, apply: bool = True) -> dict[str, Any]:
    """Consolidate verified shared posting identities through the tracking-preserving RPC."""
    from jobpulse_scraper.database.deduplication import merge_plans

    supabase = get_supabase()
    all_jobs: list[dict[str, Any]] = []
    for start in range(0, 100_000, 1000):
        response = retry_supabase(
            lambda s=start: (
                supabase.table("jobs")
                .select("id,title,company,location,employment_type,url,description,dedupe_key,closed_at")
                .order("id")
                .range(s, s + 999)
                .execute()
            )
        )
        rows = response_records(response.data)
        all_jobs.extend(rows)
        if len(rows) < 1000:
            break
    else:
        raise RuntimeError("Catalog deduplication scan budget exceeded")
    plans, skipped = merge_plans(all_jobs)
    stats = {
        "groups": len(plans),
        "candidate_rows": sum(len(plan.duplicate_ids) for plan in plans),
        "deleted_rows": 0,
        "blocked_groups": 0,
        "failed_groups": 0,
        "skipped_groups": skipped,
    }
    if apply:
        for plan in plans:
            try:
                response = retry_supabase(
                    lambda p=plan: supabase.rpc(
                        "merge_duplicate_catalog_jobs",
                        {
                            "p_keeper_id": p.keeper["id"],
                            "p_duplicate_ids": list(p.duplicate_ids),
                            "p_dedupe_key": p.dedupe_key,
                        },
                    ).execute()
                )
                removed = response_count(response.data)
                stats["deleted_rows"] += removed
                stats["blocked_groups"] += removed == 0
            except Exception:
                # SQL owns private tracking. Log only aggregate failure counts.
                stats["failed_groups"] += 1
    print("[DEDUPE] " + str(stats), flush=True)
    return stats


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
