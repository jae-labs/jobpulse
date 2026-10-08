"""Focused catalog writes, source observations and independent embedding preparation."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from jobpulse_scraper.database.client import get_supabase, retry_supabase, utc_now
from jobpulse_scraper.database.embeddings import prepare_embeddings
from jobpulse_scraper.database.records import response_records
from jobpulse_scraper.engine.description_quality import has_closed_notice, has_description_body
from jobpulse_scraper.engine.normalization import canonical_job_url
from jobpulse_scraper.engine.normalization import normalized_key as normalized_key
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_description_text, normalize_location
from jobpulse_scraper.engine.validators import is_valid_job_title, is_valid_location
from jobpulse_scraper.pipeline.detail_enrichment import enrich_job as enrich_job
from jobpulse_scraper.pipeline.employer_lookup import get_employer_lookup_service
from jobpulse_scraper.runtime.lease import active_lease, active_snapshot


class IngestionIncompleteError(RuntimeError):
    """A partial batch remains persisted but must be retried and reported as incomplete."""

    def __init__(self, persisted: int, failed: int, vectors_pending: int) -> None:
        self.persisted = persisted
        self.failed = failed
        self.vectors_pending = vectors_pending
        super().__init__(
            f"Ingestion incomplete: {persisted} vacancies persisted, {failed} writes failed, "
            f"{vectors_pending} vectors pending. Persisted vacancies were retained."
        )


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

    return not has_closed_notice(job.get("description") or "")


def _persist_catalog_batch(supabase: Any, payloads: list[dict[str, Any]], identities: dict[str, str]) -> Any:
    lease = active_lease.get()
    if lease is None:
        return supabase.table("jobs").upsert(payloads, on_conflict="dedupe_key").execute()
    records = [
        {
            "job": item,
            "snapshot_id": active_snapshot.get(),
            "work_kind": "vector" if has_description_body(item["description"]) else "detail",
            "external_id": identities.get(item["dedupe_key"]) or canonical_job_url(item["url"]),
            "content_hash": hashlib.sha256(
                json.dumps(
                    {key: value for key, value in item.items() if key not in {"last_seen_at", "closed_at"}},
                    sort_keys=True,
                ).encode()
            ).hexdigest(),
        }
        for item in payloads
    ]
    return supabase.rpc(
        "persist_crawl_jobs",
        {
            "p_task_id": lease.task_id,
            "p_token": lease.token,
            "p_jobs": records,
        },
    ).execute()


def save_jobs_batch(jobs: list[dict[str, Any]], *, enrich: bool = True) -> int:
    """Validate, enrich, persist, and embed shared vacancy facts."""
    if not jobs:
        return 0

    if active_lease.get() is not None:
        enrich = False
    valid_payloads = []
    identities: dict[str, str] = {}
    now = utc_now()

    for job in jobs:
        if not _is_ingestable_job(job):
            continue

        if enrich:
            job = enrich_job(job)
        if not enrich and job.get("description_is_snippet"):
            job = {**job, "description": ""}
        clean_desc = clean_description_text(job.get("description", ""), job.get("company", ""), job.get("title", ""))
        salary_text = job.get("salary_text") or extract_salary_from_context(clean_desc, job.get("title", ""))

        key = normalized_key(
            job["company"], job["title"], job.get("url", ""), job.get("location", ""), job.get("employment_type", "")
        )

        if isinstance(job.get("external_id"), str) and job["external_id"]:
            identities[key] = job["external_id"]

        employer = None
        try:
            lookup_service = get_employer_lookup_service()
            employer = lookup_service.resolve_employer(
                job.get("company", ""),
                scraped_location=job.get("location", ""),
            )
        except Exception as lookup_err:
            logging.getLogger(__name__).debug("Employer lookup skipped for %s: %s", job.get("company"), lookup_err)

        # A company address is not evidence of this vacancy's work location.
        norm_loc = normalize_location(job.get("location", ""))
        latitude = job.get("latitude")
        longitude = job.get("longitude")
        valid_coordinates = (
            isinstance(latitude, (int, float))
            and not isinstance(latitude, bool)
            and isinstance(longitude, (int, float))
            and not isinstance(longitude, bool)
            and -90 <= latitude <= 90
            and -180 <= longitude <= 180
        )
        if not valid_coordinates:
            latitude = longitude = None
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
                "coordinate_source": "posting" if valid_coordinates else None,
                "last_seen_at": now,
                # Re-seen postings reopen: the upsert clears a prior soft-close.
                "closed_at": None,
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
    failed = 0
    vectors_pending = 0

    for i in range(0, len(payloads_to_save), batch_size):
        chunk = payloads_to_save[i : i + batch_size]
        # A detail failure must never replace a hydrated body with listing metadata.
        existing_rows = response_records(
            retry_supabase(
                lambda c=chunk: (
                    supabase.table("jobs")
                    .select("dedupe_key,description,employer_id,location,latitude,longitude,coordinate_source")
                    .in_("dedupe_key", [item["dedupe_key"] for item in c])
                    .execute()
                )
            ).data
        )
        existing = {row["dedupe_key"]: row for row in existing_rows}
        for item in chunk:
            prior = existing.get(item["dedupe_key"], {})
            previous = prior.get("description", "")
            if item["employer_id"] is None:
                item["employer_id"] = prior.get("employer_id")
            if (
                item["coordinate_source"] is None
                and prior.get("coordinate_source") == "posting"
                and prior.get("location") == item["location"]
            ):
                for key in ("latitude", "longitude", "coordinate_source"):
                    item[key] = prior.get(key)
            if not has_description_body(item["description"]) and has_description_body(previous):
                item["description"] = previous
        # Metadata-only listings are still real vacancies. Persist them so they
        # stay visible and repairable; embedding preparation withdraws/skips stub
        # bodies, so a missing body never produces a semantic document. A hydrated
        # body is preserved above and never replaced by listing metadata.
        bodyless = [item for item in chunk if not has_description_body(item["description"])]
        if bodyless:
            logging.getLogger(__name__).warning(
                "%d listings lack a published description body; stored without embeddings for repair",
                len(bodyless),
            )
        try:
            persisted = response_records(
                retry_supabase(lambda c=chunk: _persist_catalog_batch(supabase, c, identities)).data
            )
        except Exception as exc:
            print(f"  [SUPABASE] Batch write error: {exc}. Falling back to single inserts...")
            persisted = []
            for item in chunk:
                try:
                    response = retry_supabase(lambda it=item: _persist_catalog_batch(supabase, [it], identities))
                    persisted.extend(response_records(response.data))
                except Exception as write_error:
                    failed += 1
                    print(f"  [SUPABASE] Single job write failed: {write_error}")

        if persisted:
            added += len(persisted)
            if active_lease.get() is not None:
                continue
            try:
                pending = prepare_embeddings(persisted)
                if isinstance(pending, int):
                    vectors_pending += pending
            except Exception as emb_exc:
                vectors_pending += len(persisted)
                print(f"  [EMBEDDINGS] Warning: Could not prepare embeddings for batch: {emb_exc}")

    if failed or vectors_pending:
        raise IngestionIncompleteError(added, failed, vectors_pending)
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
        jobs = response_records(response.data)
        if not jobs:
            break
        prepare_embeddings(jobs)
        offset += len(jobs)
        if len(jobs) < page_size:
            break
    return offset
