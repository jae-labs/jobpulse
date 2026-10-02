"""Supabase database repository for saving jobs, employers, and source tracking."""

from __future__ import annotations

import hashlib
import logging
import re
import urllib.parse
from collections import defaultdict
from typing import Any

from config.loader import (
    INTEL_CAREERS_URL,
    JOBSIRELAND_URL,
    KILDARE_CAREERS_URL,
    MAYNOOTH_SEARCH_URL,
    PUBLICJOBS_URL,
    WHATJOBS_URL,
    get_employers_tuples,
)
from database.client import get_supabase, retry_supabase, utc_now
from database.embeddings import prepare_embeddings
from engine.description_quality import has_description_body, needs_description_repair
from engine.salary import extract_salary_from_context
from engine.text_cleaner import WORK_MODE_TAGS, clean_description_text, normalize_location
from engine.validators import is_valid_job_title, is_valid_location
from pipeline.employer_lookup import (
    CURATED_IRISH_EMPLOYERS,
    get_employer_lookup_service,
    normalize_company_key,
)


def normalize_company_name(company: str) -> str:
    """Standardize employer names for deterministic deduplication."""
    if not company:
        return ""
    c = company.lower().strip()
    c = re.sub(r"\b(?:ireland|limited|ltd|plc|dac|inc|corp|corporation|group|llc|holdings|company|co)\b", " ", c)
    c = re.sub(r"[^a-z0-9]+", " ", c).strip()
    return c


def normalize_job_title(title: str) -> str:
    """Standardize job titles by stripping requisition IDs, location tags, contract markers, and year suffixes."""
    if not title:
        return ""
    t = title.lower().strip()
    t = re.sub(r"&[a-z]+;", " ", t)
    # Strip location or work mode suffixes separated by dash/slash/pipe
    t = re.split(
        r"\s+[-–—|/]\s+(?:dublin|cork|galway|ireland|kildare|maynooth|limerick|waterford|remote|hybrid|onsite)", t
    )[0]
    # Strip requisition/reference codes: (Ref: 1234), [Req 5678], #12345
    t = re.sub(r"[\(\[\{]?(?:ref|req|requisition|job id|id)[:\s#]*[a-z0-9-]+[\)\]\}]?", " ", t)
    # Strip contract tags: (Fixed-Term), (Permanent), (Full-time), etc.
    t = re.sub(
        r"[\(\[\{]?(?:fixed[- ]term|permanent|temporary|contract|specified purpose|full[- ]time|part[- ]time)[\)\]\}]?",
        " ",
        t,
    )
    # Strip standard location in parenthesis at end of title: (Dublin), (Hybrid), (Remote)
    t = re.sub(
        r"\((?:dublin|cork|galway|ireland|kildare|maynooth|limerick|waterford|remote|hybrid|onsite|various locations)\)$",
        " ",
        t,
    )
    # Strip trailing year if isolated at end: 'Higher Executive Officer 2026'
    t = re.sub(r"\b202[0-9]\b", " ", t)
    # Normalize common abbreviations
    t = re.sub(r"\bsr\.?\b", "senior", t)
    t = re.sub(r"\bjr\.?\b", "junior", t)
    t = re.sub(r"\bmgr\.?\b", "manager", t)
    t = re.sub(r"\beng\.?\b", "engineer", t)
    t = re.sub(r"\bdev\.?\b", "developer", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t


TRACKING_QUERY_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "source",
    "gh_src",
    "lever-source",
    "fbclid",
    "gclid",
    "twclid",
    "mc_eid",
    "trk",
    "tracking",
    "st",
}


def canonical_job_url(url: str) -> str:
    """Normalize an ATS job URL without collapsing distinct requisitions."""
    clean = (url or "").strip()
    if not clean:
        return ""
    try:
        parsed = urllib.parse.urlparse(clean)
        query_params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
        filtered = [(k, v) for k, v in query_params if k.lower() not in TRACKING_QUERY_PARAMS]
        path = parsed.path.rstrip("/")
        if filtered:
            sorted_query = urllib.parse.urlencode(sorted(filtered))
            canonical = f"{parsed.scheme}://{parsed.netloc}{path}?{sorted_query}"
        else:
            canonical = f"{parsed.scheme}://{parsed.netloc}{path}"
        return canonical.lower()
    except Exception:
        clean = re.sub(r"[#].*$", "", clean)
        return clean.rstrip("/").lower()


def normalized_key(
    company: str,
    title: str,
    url: str = "",
    location: str = "",
    employment_type: str = "",
) -> str:
    """Generate a stable opportunity key, preferring the provider's canonical URL."""
    norm_comp = normalize_company_name(company)
    canonical_url = canonical_job_url(url)
    if canonical_url:
        identity = f"url::{canonical_url}"
    else:
        identity = "::".join(
            (
                normalize_job_title(title),
                normalize_location(location).lower(),
                (employment_type or "").strip().lower(),
            )
        )
    # Match PostgreSQL's md5() re-key format; this is not a security hash.
    return hashlib.md5(f"{norm_comp}::{identity}".encode(), usedforsecurity=False).hexdigest()


def _sanitize_val(val: Any) -> Any:
    """Recursively strip null characters that Postgres rejects."""
    if isinstance(val, str):
        return val.replace("\x00", "").replace("\\u0000", "")
    elif isinstance(val, list):
        return [_sanitize_val(x) for x in val]
    elif isinstance(val, dict):
        return {k: _sanitize_val(v) for k, v in val.items()}
    return val


def _is_ingestable_job(job: dict[str, Any]) -> bool:
    if not is_valid_job_title(job.get("title", ""), job.get("url", "")):
        return False
    if not is_valid_location(job.get("location", ""), job.get("title", ""), job.get("url", "")):
        return False

    desc_l = (job.get("description") or "").lower()
    if any(
        p in desc_l
        for p in [
            "position has been filled",
            "job is no longer available",
            "position has expired",
            "job is closed",
            "no longer accepting applications",
        ]
    ):
        return False

    return True


def _enrich_job(job: dict[str, Any]) -> dict[str, Any]:
    """Enrich a short vacancy description without changing caller-owned data."""
    job = dict(job)

    # Deep Spec Enrichment: if description is a stub or short, fetch full spec from source URL
    raw_desc = job.get("description", "")
    if job.get("url") and (job.get("description_is_snippet") or needs_description_repair(raw_desc)):
        try:
            from extractors.universal import extract_universal_job_spec

            spec = extract_universal_job_spec(job["url"], job.get("company", ""), job.get("title", ""))
            if spec and has_description_body(spec.get("description")):
                job["description"] = spec["description"]
                if spec.get("salary_text") and not job.get("salary_text"):
                    job["salary_text"] = spec["salary_text"]
                if spec.get("location") and job.get("location") in ("Ireland", "Not specified", ""):
                    job["location"] = spec["location"]
                if spec.get("employment_type") and job.get("employment_type") in ("See job post", "Not specified", ""):
                    job["employment_type"] = spec["employment_type"]
            elif job.get("description_is_snippet"):
                job["description"] = ""
        except Exception:
            if job.get("description_is_snippet"):
                job["description"] = ""
            logging.getLogger(__name__).warning("Job detail extraction failed; existing catalog body will be retained")

    return job


def save_jobs_batch(jobs: list[dict[str, Any]], *, enrich: bool = True) -> int:
    """Validate, enrich, persist, and embed shared vacancy facts."""
    if not jobs:
        return 0

    valid_payloads = []
    now = utc_now()

    for job in jobs:
        if not _is_ingestable_job(job):
            continue

        if enrich:
            job = _enrich_job(job)
        clean_desc = clean_description_text(job.get("description", ""), job.get("company", ""), job.get("title", ""))
        salary_text = job.get("salary_text") or extract_salary_from_context(clean_desc, job.get("title", ""))

        key = normalized_key(
            job["company"], job["title"], job.get("url", ""), job.get("location", ""), job.get("employment_type", "")
        )

        employer = None
        try:
            lookup_service = get_employer_lookup_service()
            employer = lookup_service.resolve_employer(
                job.get("company", ""),
                careers_url=job.get("url", ""),
                scraped_location=job.get("location", ""),
            )
        except Exception as lookup_err:
            logging.getLogger(__name__).debug("Employer lookup skipped for %s: %s", job.get("company"), lookup_err)

        norm_loc = normalize_location(job.get("location", ""))
        if (
            norm_loc in ("Ireland", "Ireland (Hybrid)", "Ireland (Remote)", "Ireland (On-site)")
            and employer
            and employer.get("location")
            and employer.get("location") != "Ireland"
        ):
            emp_loc = employer["location"]
            work_mode = next(
                (label for key, label in WORK_MODE_TAGS.items() if key in (job.get("location", "")).lower()),
                None,
            )
            if work_mode and work_mode not in emp_loc:
                norm_loc = f"{emp_loc} ({work_mode})"
            else:
                norm_loc = emp_loc

        latitude = job.get("latitude") or (employer.get("latitude") if employer else None)
        longitude = job.get("longitude") or (employer.get("longitude") if employer else None)
        employer_id = employer.get("id") if employer else None

        valid_payloads.append(
            {
                "dedupe_key": key,
                "title": _sanitize_val(job["title"]),
                "company": _sanitize_val(job["company"]),
                "location": _sanitize_val(norm_loc),
                "employment_type": _sanitize_val(job.get("employment_type") or "Not specified"),
                "salary_text": _sanitize_val(salary_text),
                "description": _sanitize_val(clean_desc),
                "url": _sanitize_val(job["url"]),
                "source": _sanitize_val(job["source"]),
                "employer_id": employer_id,
                "latitude": latitude,
                "longitude": longitude,
                "last_seen_at": now,
            }
        )

    # Deduplicate within the batch without losing a hydrated body to a later stub
    # to prevent PostgreSQL 21000 "ON CONFLICT DO UPDATE command cannot affect row a second time"
    unique_payloads: dict[str, dict[str, Any]] = {}
    for item in valid_payloads:
        previous = unique_payloads.get(item["dedupe_key"])
        if previous and has_description_body(previous["description"]) and not has_description_body(item["description"]):
            item["description"] = previous["description"]
        unique_payloads[item["dedupe_key"]] = item
    payloads_to_save = list(unique_payloads.values())

    if not payloads_to_save:
        return 0

    supabase = get_supabase()
    batch_size = 50
    added = 0

    for i in range(0, len(payloads_to_save), batch_size):
        chunk = payloads_to_save[i : i + batch_size]
        # A detail failure must never replace a hydrated body with listing metadata.
        existing_rows = (
            retry_supabase(
                lambda c=chunk: (
                    supabase.table("jobs")
                    .select("dedupe_key,description")
                    .in_("dedupe_key", [item["dedupe_key"] for item in c])
                    .execute()
                )
            ).data
            or []
        )
        existing = {row["dedupe_key"]: row for row in existing_rows}
        for item in chunk:
            previous = existing.get(item["dedupe_key"], {}).get("description", "")
            if not has_description_body(item["description"]) and has_description_body(previous):
                item["description"] = previous
        # Unresolved listings are not new semantic documents. Existing rows remain intact
        # for repair/retry; source failure never deletes a vacancy or candidate tracking.
        complete_chunk = [item for item in chunk if has_description_body(item["description"])]
        if len(complete_chunk) != len(chunk):
            logging.getLogger(__name__).warning(
                "%d listings lack a published description body; retained for source retry",
                len(chunk) - len(complete_chunk),
            )
        chunk = complete_chunk
        if not chunk:
            continue
        try:
            persisted = (
                retry_supabase(
                    lambda c=chunk: supabase.table("jobs").upsert(c, on_conflict="dedupe_key").execute()
                ).data
                or []
            )
        except Exception as exc:
            print(f"  [SUPABASE] Batch write error: {exc}. Falling back to single inserts...")
            persisted = []
            for item in chunk:
                try:
                    response = retry_supabase(
                        lambda it=item: supabase.table("jobs").upsert(it, on_conflict="dedupe_key").execute()
                    )
                    persisted.extend(response.data or [])
                except Exception as write_error:
                    print(f"  [SUPABASE] Single job write failed: {write_error}")

        if persisted:
            added += len(persisted)
            try:
                prepare_embeddings(persisted)
            except Exception as emb_exc:
                print(f"  [EMBEDDINGS] Warning: Could not prepare embeddings for batch: {emb_exc}")

    return added


def backfill_job_embeddings() -> int:
    """Prepare missing job vectors for a catalog created before native scoring."""
    client = get_supabase()
    offset = 0
    page_size = 500
    while True:
        response = retry_supabase(
            lambda start=offset: (
                client.table("jobs")
                .select(
                    "id,title,description,company,location,employment_type,salary_text,salary_min_amount,salary_max_amount,salary_currency,salary_period"
                )
                .order("id")
                .range(start, start + page_size - 1)
                .execute()
            )
        )
        jobs = response.data or []
        if not jobs:
            break
        prepare_embeddings(jobs)
        offset += len(jobs)
        if len(jobs) < page_size:
            break
    return offset


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


def delete_jobs(
    company: str,
    url_like: str | None = None,
    exclude_title: str | None = None,
    not_location_like: str | None = None,
) -> int:
    """Delete jobs from Supabase matching company and criteria (e.g. invalid anchors or foreign locations)."""
    supabase = get_supabase()
    try:
        q = supabase.table("jobs").delete().eq("company", company)
        if url_like:
            q = q.like("url", url_like)
        if exclude_title:
            q = q.neq("title", exclude_title)
        if not_location_like:
            q = q.not_.ilike("location", not_location_like)
        res = q.execute()
        return len(res.data) if res.data else 0
    except Exception as exc:
        print(f"  [SUPABASE] Delete jobs error for {company}: {exc}")
        return 0


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
        data = res.data or []
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
            deleted_total += int(response.data or 0)
        except Exception as exc:
            print(f"  [DEDUPE] Could not merge duplicate jobs: {exc}")

    print(f"  [DEDUPE] Consolidated {len(duplicate_groups)} duplicate groups; removed {deleted_total} duplicate jobs.")
    return {"groups": len(duplicate_groups), "deleted_rows": deleted_total}


def get_employer(name: str) -> dict[str, Any] | None:
    """Fetch a single employer record from Supabase by name."""
    supabase = get_supabase()
    try:
        res = supabase.table("employers").select("*").eq("name", name).limit(1).execute()
        return res.data[0] if res.data else None
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
        {"name": "WhatJobs Ireland", "url": WHATJOBS_URL, "mode": "publisher feed"},
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
