"""Persistent embedding preparation and exact, incremental scoring work."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from database.client import get_supabase, retry_supabase
from engine.scoring import (
    EMBEDDING_MODEL_VERSION,
    build_job_document,
    build_profile_document,
    encode_documents,
    get_scoring_rules,
)

# Bump whenever feature extraction, weights, penalties, or explanations change.
SCORING_VERSION = f"exact-pgvector-v2:{EMBEDDING_MODEL_VERSION}"
SCORING_BATCH_SIZE = 100


def content_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def job_scoring_input(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["id"],
        "content_hash": content_hash(
            {
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
            }
        ),
        "embedding_hash": content_hash(build_job_document(job)),
    }


def profile_scoring_input(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": profile["user_id"],
        "content_hash": content_hash(
            {
                "document": build_profile_document(profile),
                "preferences": {
                    key: profile.get(key)
                    for key in (
                        "salary_min",
                        "employment",
                        "headline",
                        "current_role",
                        "target_roles",
                        "target_locations",
                        "location",
                        "work_mode",
                        "work_authorization",
                        "keywords",
                        "tools_software",
                        "certifications",
                    )
                },
                "rules": get_scoring_rules(profile),
            }
        ),
        "embedding_hash": content_hash(build_profile_document(profile)),
    }


def prepare_embeddings(
    table: str,
    id_column: str,
    documents: dict[Any, str],
) -> None:
    """Load cache metadata only, encode missing content, then persist vectors."""
    client = get_supabase()
    items = list(documents.items())
    for start in range(0, len(items), SCORING_BATCH_SIZE):
        chunk = items[start : start + SCORING_BATCH_SIZE]
        rows = (
            retry_supabase(
                lambda c=chunk: (
                    client.table(table)
                    .select(f"{id_column},content_hash,model_version")
                    .in_(id_column, [identity for identity, _ in c])
                    .execute()
                )
            ).data
            or []
        )
        existing = {row[id_column]: row for row in rows}
        missing = [
            (identity, document)
            for identity, document in chunk
            if existing.get(identity, {}).get("content_hash") != content_hash(document)
            or existing.get(identity, {}).get("model_version") != EMBEDDING_MODEL_VERSION
        ]
        if not missing:
            continue
        # Several users may have identical background text. Encode it once.
        unique_documents = list(dict.fromkeys(document for _, document in missing))
        vectors = encode_documents(unique_documents)
        if vectors is None:
            continue
        encoded = dict(zip(unique_documents, vectors, strict=True))
        payload = [
            {
                id_column: identity,
                "content_hash": content_hash(document),
                "model_version": EMBEDDING_MODEL_VERSION,
                "embedding": encoded[document],
            }
            for identity, document in missing
        ]
        retry_supabase(lambda p=payload: client.table(table).upsert(p, on_conflict=id_column).execute())


def get_scoring_work(jobs: list[dict[str, Any]], profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    response = retry_supabase(
        lambda: (
            get_supabase()
            .rpc(
                "get_job_scoring_work",
                {
                    "p_jobs": [job_scoring_input(job) for job in jobs],
                    "p_profiles": [profile_scoring_input(profile) for profile in profiles],
                    "p_model_version": EMBEDDING_MODEL_VERSION,
                    "p_scoring_version": SCORING_VERSION,
                },
            )
            .execute()
        )
    )
    if not isinstance(response.data, list):
        raise RuntimeError("Invalid response from get_job_scoring_work; no evaluations were written.")
    return response.data


def verify_scoring_schema() -> None:
    try:
        get_scoring_work([], [])
    except Exception:
        raise RuntimeError(
            "Pgvector scoring is unavailable. Apply the persistent scoring embeddings migration before scraping."
        ) from None
