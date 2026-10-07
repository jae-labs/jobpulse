"""Reconcile sectors using shared database facts only; never fetch job websites."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from database.client import retry_supabase
from database.records import response_records

TRUSTED_SOURCES = {"curated", "watchlist", "verified"}
PLACEHOLDERS = {"employer", "confidential", "undisclosed", "jobsireland employer"}


def company_identity_key(name: str) -> str:
    """Allow punctuation/legal suffix differences, retaining countries and business units."""
    normalized = " ".join(re.sub(r"[^a-z0-9]+", " ", name.casefold()).split())
    return re.sub(r"(?:\s+(?:limited|ltd|plc|dac|inc|incorporated|corp|corporation|llc))+$", "", normalized)


def trusted_sector_index(client: Any) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = {}
    cursor = None
    while True:

        def fetch_page(cursor=cursor):
            query = client.table("employers").select("id,name,sector,metadata_source").order("id").limit(500)
            if cursor is not None:
                query = query.gt("id", cursor)
            return query.execute()

        rows = response_records(retry_supabase(fetch_page).data)
        for row in rows:
            if (
                row["metadata_source"] in TRUSTED_SOURCES
                and row.get("sector")
                and row["sector"].casefold() != "uncategorized"
                and row["name"].casefold() not in PLACEHOLDERS
            ):
                index.setdefault(company_identity_key(row["name"]), []).append(row)
        if len(rows) < 500:
            return index
        cursor = rows[-1]["id"]


def load_reviewed_evidence(path: Path | None) -> dict[str, dict[str, Any]]:
    """An explicitly reviewed self-description, not a role-keyword classification rule."""
    if path is None:
        return {}
    result = {}
    for record in json.loads(path.read_text(encoding="utf-8")):
        name = " ".join(record["employer_name"].split()).casefold()
        if (
            name in result
            or name in PLACEHOLDERS
            or not record.get("sector")
            or record["sector"].casefold() == "uncategorized"
            or not record.get("reviewed_on")
            or len(record.get("excerpt", "").strip()) < 30
            or not isinstance(record.get("job_id"), int)
            or not re.fullmatch(r"[0-9a-f]{64}", record.get("description_sha256", ""))
            or (record.get("description") is not None and not isinstance(record["description"], str))
        ):
            raise ValueError("Stored employer evidence requires a unique identity and reviewed posting witness")
        result[name] = record
    return result


def stored_sector_evidence(
    client: Any,
    employer: dict[str, Any],
    index: dict[str, list[dict[str, Any]]],
    reviewed: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    name = " ".join(employer["name"].split()).casefold()
    description = None
    if name in PLACEHOLDERS:
        return None
    candidates = index.get(company_identity_key(employer["name"]), [])
    if candidates:
        # Multiple conflicting trusted records require review, never a first-match guess.
        if len({row["sector"].casefold() for row in candidates}) != 1:
            return None
        donor = candidates[0]
        current = response_records(
            retry_supabase(
                lambda: (
                    client.table("employers")
                    .select("id")
                    .eq("id", donor["id"])
                    .eq("name", donor["name"])
                    .eq("sector", donor["sector"])
                    .eq("metadata_source", donor["metadata_source"])
                    .execute()
                )
            ).data
        )
        if not current:
            return None
        sector, source = donor["sector"], f"database.employers/{donor['id']}"
    elif witness := reviewed.get(name):
        postings = response_records(
            retry_supabase(
                lambda: (
                    client.table("jobs")
                    .select("id,company,employer_id,description")
                    .eq("id", witness["job_id"])
                    .eq("employer_id", employer["id"])
                    .execute()
                )
            ).data
        )
        if len(postings) != 1 or " ".join(postings[0]["company"].split()).casefold() != name:
            return None
        body = postings[0].get("description") or ""
        if hashlib.sha256(body.encode()).hexdigest() != witness["description_sha256"] or witness["excerpt"] not in body:
            return None
        description = witness.get("description")
        if description is not None and (not description.strip() or description not in witness["excerpt"]):
            return None
        sector, source = witness["sector"], f"database.jobs/{witness['job_id']}"
    else:
        return None
    # Sector evidence does not validate unsupported headquarters, coordinates or websites.
    return {
        "sector": sector,
        "metadata_source": "verified",
        "location": None,
        "latitude": None,
        "longitude": None,
        "description": description,
        "website": None,
        "sources": [source],
    }
