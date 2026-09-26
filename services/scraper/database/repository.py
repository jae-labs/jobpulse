"""Supabase database repository for saving jobs, employers, and source tracking."""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from config.loader import (
    INTEL_CAREERS_URL,
    KILDARE_CAREERS_URL,
    MAYNOOTH_SEARCH_URL,
    PUBLICJOBS_URL,
    get_employers_tuples,
)
from database.client import get_supabase, retry_supabase, utc_now
from engine.salary import extract_salary_from_context
from engine.scoring import evaluate_job_ai
from engine.text_cleaner import clean_description_text, normalize_location
from engine.validators import is_valid_job_title, is_valid_location


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


def canonical_job_url(url: str) -> str:
    """Normalize an ATS job URL without collapsing distinct requisitions."""
    clean = (url or "").strip()
    clean = re.sub(r"[?#].*$", "", clean)
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
    # This is an identifier, not a security primitive.  MD5 keeps the Python
    # key compatible with PostgreSQL's built-in md5() during database re-keys.
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


def save_job(job: dict[str, Any], profile: dict[str, Any] | None = None) -> bool:
    """Validate, score, and upsert a discovered opportunity."""

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

    # Deep Spec Enrichment: if description is a stub or short, fetch full spec from source URL
    raw_desc = job.get("description", "")
    if job.get("url") and (
        len(raw_desc) < 250 or "Check the official vacancy post" in raw_desc or "opportunity:" in raw_desc
    ):
        try:
            from extractors.universal import extract_universal_job_spec

            spec = extract_universal_job_spec(job["url"], job.get("company", ""), job.get("title", ""))
            if spec and len(spec.get("description", "")) > 250:
                job["description"] = spec["description"]
                if spec.get("salary_text") and not job.get("salary_text"):
                    job["salary_text"] = spec["salary_text"]
                if spec.get("location") and job.get("location") in ("Ireland", "Not specified", ""):
                    job["location"] = spec["location"]
                if spec.get("employment_type") and job.get("employment_type") in ("See job post", "Not specified", ""):
                    job["employment_type"] = spec["employment_type"]
        except Exception:
            pass

    clean_desc = clean_description_text(job.get("description", ""), job.get("company", ""), job.get("title", ""))
    job["description"] = clean_desc
    salary_text = job.get("salary_text") or extract_salary_from_context(
        job.get("description", ""), job.get("title", "")
    )

    ai_eval = evaluate_job_ai(
        title=job["title"],
        description=job["description"],
        company=job.get("company", ""),
        location=job.get("location", ""),
        salary_text=salary_text,
        employment_type=job.get("employment_type", ""),
        profile=profile,
    )

    key = normalized_key(
        job["company"], job["title"], job.get("url", ""), job.get("location", ""), job.get("employment_type", "")
    )
    now = utc_now()

    payload = {
        "dedupe_key": key,
        "title": _sanitize_val(job["title"]),
        "company": _sanitize_val(job["company"]),
        "location": _sanitize_val(normalize_location(job.get("location", ""))),
        "employment_type": _sanitize_val(job.get("employment_type") or "Not specified"),
        "salary_text": _sanitize_val(salary_text),
        "description": _sanitize_val(job["description"]),
        "url": _sanitize_val(job["url"]),
        "source": _sanitize_val(job["source"]),
        "relevance": ai_eval.get("fit_score", 0),
        "matched_skills": _sanitize_val(ai_eval.get("matched_skills", [])),
        "fit_tier": _sanitize_val(ai_eval.get("fit_tier", "Unassessed")),
        "role_domain": _sanitize_val(ai_eval.get("role_domain", "General")),
        "seniority_level": _sanitize_val(ai_eval.get("seniority_level", "Not specified")),
        "ai_analysis": _sanitize_val(ai_eval),
        "last_seen_at": now,
        "status": _sanitize_val(job.get("status", "new")),
    }

    try:
        supabase = get_supabase()
        res = retry_supabase(lambda: supabase.table("jobs").upsert(payload, on_conflict="dedupe_key").execute())
        if res.data:
            evaluate_and_save_user_evaluations(res.data)
        return bool(res.data)
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Failed to upsert job '{job.get('title')}': {exc}")
        return False


def save_jobs_batch(jobs: list[dict[str, Any]], profile: dict[str, Any] | None = None) -> int:
    """Validate, score, upsert, and evaluate opportunities in bounded batches."""
    if not jobs:
        return 0

    valid_payloads = []
    now = utc_now()

    for job in jobs:
        if not is_valid_job_title(job.get("title", ""), job.get("url", "")):
            continue
        if not is_valid_location(job.get("location", ""), job.get("title", ""), job.get("url", "")):
            continue

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
            continue

        clean_desc = clean_description_text(job.get("description", ""), job.get("company", ""), job.get("title", ""))
        salary_text = job.get("salary_text") or extract_salary_from_context(clean_desc, job.get("title", ""))

        ai_eval = evaluate_job_ai(
            title=job["title"],
            description=clean_desc,
            company=job.get("company", ""),
            location=job.get("location", ""),
            salary_text=salary_text,
            employment_type=job.get("employment_type", ""),
            profile=profile,
        )

        key = normalized_key(
            job["company"], job["title"], job.get("url", ""), job.get("location", ""), job.get("employment_type", "")
        )
        valid_payloads.append(
            {
                "dedupe_key": key,
                "title": _sanitize_val(job["title"]),
                "company": _sanitize_val(job["company"]),
                "location": _sanitize_val(normalize_location(job.get("location", ""))),
                "employment_type": _sanitize_val(job.get("employment_type") or "Not specified"),
                "salary_text": _sanitize_val(salary_text),
                "description": _sanitize_val(clean_desc),
                "url": _sanitize_val(job["url"]),
                "source": _sanitize_val(job["source"]),
                "relevance": ai_eval.get("fit_score", 0),
                "matched_skills": _sanitize_val(ai_eval.get("matched_skills", [])),
                "fit_tier": _sanitize_val(ai_eval.get("fit_tier", "Unassessed")),
                "role_domain": _sanitize_val(ai_eval.get("role_domain", "General")),
                "seniority_level": _sanitize_val(ai_eval.get("seniority_level", "Not specified")),
                "ai_analysis": _sanitize_val(ai_eval),
                "last_seen_at": now,
                "status": _sanitize_val(job.get("status", "new")),
            }
        )

    if not valid_payloads:
        return 0

    # Resolve profiles once for the whole batch. Calling this inside the per-job
    # path turns one scrape into N database reads before any rows are written.
    user_profiles = get_all_user_profiles()
    supabase = get_supabase()
    batch_size = 50
    added = 0

    for i in range(0, len(valid_payloads), batch_size):
        chunk = valid_payloads[i : i + batch_size]
        try:
            res = retry_supabase(lambda c=chunk: supabase.table("jobs").upsert(c, on_conflict="dedupe_key").execute())
            if res.data:
                added += len(res.data)
                evaluate_and_save_user_evaluations(res.data, profiles=user_profiles)
        except Exception as exc:
            print(f"  [SUPABASE] Batch error: {exc}. Falling back to single inserts...")
            for item in chunk:
                try:
                    s_res = retry_supabase(
                        lambda it=item: supabase.table("jobs").upsert(it, on_conflict="dedupe_key").execute()
                    )
                    if s_res.data:
                        added += 1
                        evaluate_and_save_user_evaluations(s_res.data, profiles=user_profiles)
                except Exception:
                    pass

    return added


def get_all_user_profiles() -> list[dict[str, Any]]:
    """Fetch all user profiles from Supabase user_profiles table."""
    supabase = get_supabase()
    try:
        res = retry_supabase(lambda: supabase.table("user_profiles").select("*").execute())
        return res.data or []
    except Exception as exc:
        print(f"  [SUPABASE] Warning: Could not fetch user_profiles: {exc}")
        return []


def evaluate_and_save_user_evaluations(
    jobs: list[dict[str, Any]],
    profiles: list[dict[str, Any]] | None = None,
) -> int:
    """
    Evaluate jobs against each user profile from Supabase and upsert
    the resulting scores into user_job_evaluations.
    """
    if not jobs:
        return 0

    supabase = get_supabase()
    user_profiles = profiles if profiles is not None else get_all_user_profiles()
    if not user_profiles:
        return 0

    eval_payloads = []
    now = utc_now()

    for job in jobs:
        job_id = job.get("id")
        if not job_id:
            dedupe_key = job.get("dedupe_key")
            if dedupe_key:
                try:
                    lookup = retry_supabase(
                        lambda dk=dedupe_key: (
                            supabase.table("jobs").select("id").eq("dedupe_key", dk).limit(1).execute()
                        )
                    )
                    if lookup.data:
                        job_id = lookup.data[0]["id"]
                except Exception:
                    pass
        if not job_id:
            continue

        clean_desc = job.get("description", "")
        salary_text = job.get("salary_text") or extract_salary_from_context(clean_desc, job.get("title", ""))

        for user_profile in user_profiles:
            user_id = user_profile.get("user_id")
            if not user_id:
                continue

            ai_eval = evaluate_job_ai(
                title=job.get("title", ""),
                description=clean_desc,
                company=job.get("company", ""),
                location=job.get("location", ""),
                salary_text=salary_text,
                employment_type=job.get("employment_type", ""),
                profile=user_profile,
            )

            eval_payloads.append(
                {
                    "user_id": user_id,
                    "job_id": job_id,
                    "relevance": ai_eval.get("fit_score", 0),
                    "fit_tier": _sanitize_val(ai_eval.get("fit_tier", "Unassessed")),
                    "matched_skills": _sanitize_val(ai_eval.get("matched_skills", [])),
                    "ai_analysis": _sanitize_val(ai_eval),
                    "calculated_at": now,
                }
            )

    if not eval_payloads:
        return 0

    batch_size = 50
    saved_count = 0
    for i in range(0, len(eval_payloads), batch_size):
        chunk = eval_payloads[i : i + batch_size]
        try:
            res = retry_supabase(
                lambda c=chunk: supabase.table("user_job_evaluations").upsert(c, on_conflict="user_id,job_id").execute()
            )
            if res.data:
                saved_count += len(res.data)
        except Exception as exc:
            print(f"  [SUPABASE] Warning: Failed to upsert user_job_evaluations: {exc}")

    return saved_count


def rescore_all_jobs(user_id: str | None = None) -> int:
    """Fetch all existing jobs from Supabase and calculate evaluations for all (or specified) user profiles."""
    supabase = get_supabase()
    profiles = get_all_user_profiles()
    if user_id:
        profiles = [p for p in profiles if p.get("user_id") == user_id]

    if not profiles:
        print("  [SUPABASE] No user profiles found in Supabase to score against.")
        return 0

    print(f"  [SUPABASE] Rescoring jobs for {len(profiles)} user profile(s)...")
    for p in profiles:
        print(f"    - {p.get('name', 'User')} ({p.get('user_id')}) : {p.get('headline')}")

    page_size = 100
    start = 0
    total_evaluated = 0
    while True:
        res = (
            supabase.table("jobs")
            .select("id, dedupe_key, title, description, company, location, salary_text, employment_type")
            .range(start, start + page_size - 1)
            .execute()
        )
        jobs = res.data or []
        if not jobs:
            break
        total_evaluated += evaluate_and_save_user_evaluations(jobs, profiles=profiles)
        start += page_size
        if len(jobs) < page_size:
            break

    print(f"  [SUPABASE] Completed rescoring: {total_evaluated} user-job evaluations updated.")
    return total_evaluated


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


def prune_stale_jobs(retention_days: int = 3) -> dict[str, Any]:
    """
    Remove stale job postings where last_seen_at is older than retention_days,
    specifically targeting opportunities with status 'new' or 'not_interested'.

    Guarantees that jobs actively tracked by ANY user in user_job_statuses
    (e.g. 'applied', 'interviewing', 'interested') are strictly preserved and never deleted.

    Informs how many jobs are deleted and how many are retained because they have an active status.
    """
    supabase = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    print("\n" + "=" * 72)
    print(f"Lifecycle Retention Check: Identifying job postings not seen for >= {retention_days} days...")
    print(f"Cutoff timestamp: {cutoff}")
    print("=" * 72)

    page_size = 500
    start = 0
    stale_jobs: list[dict[str, Any]] = []

    while True:
        try:
            res = retry_supabase(
                lambda s=start: (
                    supabase.table("jobs")
                    .select("id, title, company, status, last_seen_at")
                    .lt("last_seen_at", cutoff)
                    .range(s, s + page_size - 1)
                    .execute()
                )
            )
            rows = res.data or []
            stale_jobs.extend(rows)
            if len(rows) < page_size:
                break
            start += page_size
        except Exception as exc:
            print(f"  [SUPABASE] Warning: Error fetching stale jobs: {exc}")
            break

    if not stale_jobs:
        print(f"  [CLEANUP] No stale jobs found older than {retention_days} days.")
        return {
            "total_evaluated": 0,
            "deleted_count": 0,
            "deleted_breakdown": {},
            "retained_count": 0,
            "retained_breakdown": {},
            "retention_days": retention_days,
            "cutoff_timestamp": cutoff,
        }

    # Query user_job_statuses for all stale job IDs across ALL users
    stale_ids = [j["id"] for j in stale_jobs]
    user_status_map: dict[int, set[str]] = defaultdict(set)
    batch_size = 200

    for i in range(0, len(stale_ids), batch_size):
        chunk_ids = stale_ids[i : i + batch_size]
        try:
            u_res = retry_supabase(
                lambda cids=chunk_ids: (
                    supabase.table("user_job_statuses").select("job_id, status").in_("job_id", cids).execute()
                )
            )
            for row in u_res.data or []:
                st_clean = (row.get("status") or "").strip().lower().replace(" ", "_")
                if st_clean:
                    user_status_map[row["job_id"]].add(st_clean)
        except Exception as exc:
            raise RuntimeError("Cannot prune jobs without verifying every user's tracking status") from exc

    # Partition into Discardable vs Protected across all users
    DISCARDABLE_STATUSES = {"new", "not_interested"}
    to_delete_ids: list[int] = []
    retained_counts: dict[str, int] = defaultdict(int)
    discarded_counts: dict[str, int] = defaultdict(int)

    for job in stale_jobs:
        jid = job["id"]
        user_statuses = user_status_map.get(jid, set())
        fallback_status = (job.get("status") or "new").strip().lower().replace(" ", "_")
        all_statuses = user_statuses | {fallback_status} if user_statuses else {fallback_status}

        # Check if ANY user has marked this job as applied, interviewing, interested, etc.
        active_statuses = {s for s in all_statuses if s not in DISCARDABLE_STATUSES}
        if active_statuses:
            for s in active_statuses:
                retained_counts[s] += 1
        else:
            to_delete_ids.append(jid)
            if "not_interested" in all_statuses:
                discarded_counts["not_interested"] += 1
            else:
                discarded_counts["new"] += 1

    # Batch delete discardable jobs
    deleted_count = 0
    del_batch = 50
    for i in range(0, len(to_delete_ids), del_batch):
        chunk = to_delete_ids[i : i + del_batch]
        try:
            res = retry_supabase(lambda c=chunk: supabase.table("jobs").delete().in_("id", c).execute())
            if res.data:
                deleted_count += len(res.data)
        except Exception as exc:
            print(f"  [SUPABASE] Error deleting stale jobs chunk: {exc}")

    retained_total = len(stale_jobs) - len(to_delete_ids)
    print("\n" + "=" * 72)
    print(f"Lifecycle Retention & Pruning Summary (Older than {retention_days} days):")
    print(f"  - Stale postings evaluated:      {len(stale_jobs)}")
    print(f"  - Postings deleted:              {deleted_count}")
    print(f"      ├── Status 'new' (untracked): {discarded_counts.get('new', 0)}")
    print(f"      └── Status 'not_interested': {discarded_counts.get('not_interested', 0)}")
    print(f"  - Postings preserved (active):   {retained_total}")
    if retained_counts:
        for st_name, count in sorted(retained_counts.items()):
            label = st_name.replace("_", " ").title()
            print(f"      └── {label}: {count}")
    else:
        print("      └── None with active status")
    print("=" * 72 + "\n")

    return {
        "total_evaluated": len(stale_jobs),
        "deleted_count": deleted_count,
        "deleted_breakdown": dict(discarded_counts),
        "retained_count": retained_total,
        "retained_breakdown": dict(retained_counts),
        "retention_days": retention_days,
        "cutoff_timestamp": cutoff,
    }


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

        try:
            for table, fields in (
                ("user_job_statuses", ("user_id", "status", "updated_at")),
                (
                    "user_job_evaluations",
                    ("user_id", "relevance", "fit_tier", "matched_skills", "ai_analysis", "calculated_at"),
                ),
            ):
                existing = retry_supabase(
                    lambda t=table, jid=keeper_id: supabase.table(t).select("*").eq("job_id", jid).execute()
                )
                covered_users = {row["user_id"]: row for row in existing.data or []}
                for dup_id in dup_ids:
                    related = retry_supabase(
                        lambda t=table, jid=dup_id: supabase.table(t).select("*").eq("job_id", jid).execute()
                    )
                    for row in related.data or []:
                        user_id = row["user_id"]
                        if user_id in covered_users:
                            if table == "user_job_statuses" and covered_users[user_id]["status"] != row["status"]:
                                raise ValueError(f"Conflicting tracking statuses for user {user_id}")
                            continue
                        payload = {field: row[field] for field in fields}
                        payload["job_id"] = keeper["id"]
                        retry_supabase(lambda t=table, p=payload: supabase.table(t).insert(p).execute())
                        covered_users[user_id] = row
        except Exception as exc:
            print(f"  [DEDUPE] Preserving duplicate jobs because user data could not be transferred: {exc}")
            continue

        correct_key = normalized_key(
            keeper["company"],
            keeper["title"],
            keeper.get("url", ""),
            keeper.get("location", ""),
            keeper.get("employment_type", ""),
        )
        if keeper.get("dedupe_key") != correct_key:
            try:
                supabase.table("jobs").update({"dedupe_key": correct_key}).eq("id", keeper["id"]).execute()
            except Exception as exc:
                print(f"  [DEDUPE] Preserving duplicate jobs because canonical key update failed: {exc}")
                continue

        try:
            del_res = supabase.table("jobs").delete().in_("id", dup_ids).execute()
            if del_res.data:
                deleted_total += len(del_res.data)
        except Exception as exc:
            print(f"  [DEDUPE] Error deleting duplicates for {keeper['title']}: {exc}")

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
        employer_payloads = [
            {
                "name": _sanitize_val(emp[0]),
                "sector": _sanitize_val(emp[1]),
                "priority": emp[2],
                "careers_url": _sanitize_val(emp[3]),
            }
            for emp in employers_tuples
        ]
        try:
            supabase.table("employers").upsert(employer_payloads, on_conflict="name").execute()
        except Exception as exc:
            print(f"  [SUPABASE] Warning: Failed to sync employers: {exc}")

        # 2. Register watchlist in Sources
        watchlist_sources = [
            {
                "name": _sanitize_val(emp[0]),
                "url": _sanitize_val(emp[3]),
                "mode": "company crawler",
            }
            for emp in employers_tuples
        ]
        try:
            supabase.table("sources").upsert(watchlist_sources, on_conflict="name").execute()
        except Exception as exc:
            print(f"  [SUPABASE] Warning: Failed to sync watchlist sources: {exc}")

    # 3. Core Specialized Scrapers in Sources
    core_sources = [
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
