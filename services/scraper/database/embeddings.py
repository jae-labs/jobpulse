"""Persistent job embedding preparation."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from database.client import get_supabase, retry_supabase
from database.records import response_records
from engine.description_quality import has_description_body
from engine.embeddings import EMBEDDING_MODEL_REVISION, EMBEDDING_MODEL_VERSION, build_job_document, encode_documents

EMBEDDING_BATCH_SIZE = 100


def content_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def job_scoring_hash(job: dict[str, Any]) -> str:
    """Hash every job fact used by PostgreSQL's rule scorer."""
    return content_hash(
        {
            "document_version": "full-body-token-windows:v2",
            "model_revision": EMBEDDING_MODEL_REVISION,
            **{
                key: job.get(key)
                for key in (
                    "title",
                    "description",
                    "company",
                    "location",
                    "salary_text",
                    "salary_min_amount",
                    "salary_max_amount",
                    "salary_currency",
                    "salary_period",
                    "employment_type",
                )
            },
        }
    )


def prepare_embeddings(jobs: list[dict[str, Any]]) -> int:
    """Update vectors and enqueue durable SQL rescoring when any scoring fact changes."""
    client = get_supabase()
    pending = 0
    for start in range(0, len(jobs), EMBEDDING_BATCH_SIZE):
        chunk = jobs[start : start + EMBEDDING_BATCH_SIZE]
        rows = response_records(
            retry_supabase(
                lambda c=chunk: (
                    client.table("job_scoring_embeddings")
                    .select("job_id,content_hash,model_version")
                    .in_("job_id", [job["id"] for job in c])
                    .execute()
                )
            ).data
        )
        existing = {row["job_id"]: row for row in rows}
        invalid_ids = [
            job["id"] for job in chunk if not has_description_body(job.get("description")) and job["id"] in existing
        ]
        if invalid_ids:
            # Withdraw derived stub vectors, not vacancies or candidate tracking.
            # The existing DELETE trigger advances catalog generation for SQL rescoring.
            retry_supabase(
                lambda ids=invalid_ids: client.table("job_scoring_embeddings").delete().in_("job_id", ids).execute()
            )
        chunk = [job for job in chunk if has_description_body(job.get("description"))]
        missing = []
        for job in chunk:
            scoring_hash = job_scoring_hash(job)
            cached = existing.get(job["id"], {})
            if cached.get("content_hash") != scoring_hash or cached.get("model_version") != EMBEDDING_MODEL_VERSION:
                missing.append((job, scoring_hash, build_job_document(job)))
        if not missing:
            continue
        # Several vacancies can share a description. Encode it once.
        unique_documents = list(dict.fromkeys(document for _, _, document in missing))
        vectors = encode_documents(unique_documents)
        if vectors is None:
            pending += len(missing)
            logging.getLogger(__name__).warning(
                "Job embedding batch unavailable; %d vacancies await retry", len(missing)
            )
            continue
        encoded = dict(zip(unique_documents, vectors, strict=True))
        deduped_payload: dict[Any, dict[str, Any]] = {}
        for job, scoring_hash, document in missing:
            deduped_payload[job["id"]] = {
                "job_id": job["id"],
                "content_hash": scoring_hash,
                "model_version": EMBEDDING_MODEL_VERSION,
                "embedding": encoded[document],
            }
        payload = list(deduped_payload.values())
        retry_supabase(
            lambda p=payload: client.table("job_scoring_embeddings").upsert(p, on_conflict="job_id").execute()
        )
    return pending
