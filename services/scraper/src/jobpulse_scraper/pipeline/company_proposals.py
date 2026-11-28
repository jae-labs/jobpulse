"""Public active-employer selection and durable, review-only AI proposal reuse."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from jobpulse_scraper.company_index.download import index_lock
from jobpulse_scraper.database.client import retry_supabase
from jobpulse_scraper.database.records import response_records
from jobpulse_scraper.local_data import prepare_company_root
from jobpulse_scraper.paths import COMPANY_RESEARCH_ROOT
from jobpulse_scraper.pipeline.ai_enrichment import VALID_SIZES, is_valid_ireland_coordinate
from jobpulse_scraper.pipeline.research_progress import event, progress

CACHE_ROOT = COMPANY_RESEARCH_ROOT
SCHEMA_VERSION = 1


class OfficeProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=512)
    address: str = Field(min_length=1, max_length=2048)
    city: str = Field(max_length=256)
    country_code: str
    eircode: str | None = Field(default=None, max_length=32)
    latitude: float
    longitude: float
    place_id: str = Field(min_length=1, max_length=512)


class CompanyProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=256)
    sector: str = Field(max_length=256)
    size: str
    description: str = Field(default="", max_length=16000)
    website: str = Field(default="", max_length=2048)
    website_domain: str | None = Field(default=None, max_length=256)
    offices: list[OfficeProposal] = Field(max_length=3)


def validate_proposal(proposal: dict, employer: dict) -> dict:
    record = CompanyProposal.model_validate(proposal)
    if record.name.casefold() != employer["name"].casefold() or record.size not in {"", *VALID_SIZES}:
        raise ValueError("Invalid company identity or staff-size bracket")
    if any(o.country_code != "IE" or not is_valid_ireland_coordinate(o.latitude, o.longitude) for o in record.offices):
        raise ValueError("Invalid Ireland office proposal")
    return record.model_dump(exclude_none=True)


def identity_key(employer: dict) -> str:
    public = {key: employer.get(key) or "" for key in ("id", "name", "website", "company_number")}
    return hashlib.sha256(json.dumps([SCHEMA_VERSION, public], sort_keys=True).encode()).hexdigest()


class ProposalStore:
    def __init__(self, root: Path = CACHE_ROOT):
        prepare_company_root(root)
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root = root
        self.connection = sqlite3.connect(root / "proposals.sqlite3", timeout=30)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute(
            "CREATE TABLE IF NOT EXISTS proposals (identity_key TEXT PRIMARY KEY, record TEXT NOT NULL, checksum TEXT NOT NULL)"
        )
        self.connection.execute(
            "CREATE TABLE IF NOT EXISTS failures (identity_key TEXT PRIMARY KEY, retry_at REAL NOT NULL, category TEXT NOT NULL)"
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def get(self, employer: dict) -> dict | None:
        row = self.connection.execute(
            "SELECT record,checksum FROM proposals WHERE identity_key=?", (identity_key(employer),)
        ).fetchone()
        if row is None:
            return None
        if hashlib.sha256(row[0].encode()).hexdigest() != row[1]:
            raise ValueError("Company proposal cache checksum mismatch")
        record = json.loads(row[0])
        if record["identity_key"] != identity_key(employer) or record["employer_id"] != employer["id"]:
            raise ValueError("Company proposal cache identity mismatch")
        if record["schema_version"] != SCHEMA_VERSION or identity_key(record["employer_identity"]) != identity_key(
            employer
        ):
            raise ValueError("Company proposal cache identity mismatch")
        validate_proposal(record["proposal"], employer)
        return record

    def deferred(self, employer: dict) -> bool:
        row = self.connection.execute(
            "SELECT retry_at FROM failures WHERE identity_key=?", (identity_key(employer),)
        ).fetchone()
        return bool(row and row[0] > time.time())

    def save(self, records: list[dict]) -> None:
        with self.connection:
            for record in records:
                encoded = json.dumps(record, sort_keys=True)
                self.connection.execute(
                    "INSERT OR REPLACE INTO proposals VALUES (?,?,?)",
                    (record["identity_key"], encoded, hashlib.sha256(encoded.encode()).hexdigest()),
                )
                self.connection.execute("DELETE FROM failures WHERE identity_key=?", (record["identity_key"],))

    def fail(self, employers: list[dict], category: str) -> None:
        with self.connection:
            self.connection.executemany(
                "INSERT OR REPLACE INTO failures VALUES (?,?,?)",
                [(identity_key(e), time.time() + 21600, category) for e in employers],
            )

    def export(self) -> list[dict]:
        results = []
        for (encoded,) in self.connection.execute("SELECT record FROM proposals ORDER BY identity_key"):
            record = json.loads(encoded)
            results.append(self.get(record["employer_identity"]))
        return results


def active_employers(client, *, now: datetime | None = None, page_size: int = 1000) -> list[dict]:
    if not 1 <= page_size <= 1000:
        raise ValueError("page_size must be 1-1000")
    cutoff = ((now or datetime.now(UTC)) - timedelta(hours=24)).isoformat()
    cursor = 0
    ids: set[int] = set()
    while True:
        rows = response_records(
            retry_supabase(
                lambda cursor=cursor: (
                    client.table("jobs")
                    .select("id,employer_id")
                    .eq("availability_status", "active")
                    .gte("availability_checked_at", cutoff)
                    .gt("id", cursor)
                    .order("id")
                    .limit(page_size)
                    .execute()
                )
            ).data
        )
        if not rows:
            break
        ids.update(row["employer_id"] for row in rows if type(row.get("employer_id")) is int and row["employer_id"] > 0)
        next_cursor = rows[-1]["id"]
        if type(next_cursor) is not int or next_cursor <= cursor:
            raise ValueError("Active job pagination did not advance")
        cursor = next_cursor
        event("active_employer_scan", jobs_through_id=cursor, distinct_employers=len(ids))
    employers = []
    ordered = sorted(ids)
    for offset in range(0, len(ordered), 100):
        batch = ordered[offset : offset + 100]
        employers.extend(
            response_records(
                retry_supabase(
                    lambda batch=batch: (
                        client.table("employers").select("id,name,website").in_("id", batch).order("id").execute()
                    )
                ).data
            )
        )
    return [
        {"id": e["id"], "name": e["name"], "website": e.get("website") or "", "company_number": ""}
        for e in sorted(employers, key=lambda e: e["id"])
    ]


def select_pending(
    employers: list[dict], store: ProposalStore, limit: int, *, refresh: bool = False
) -> tuple[list[dict], dict]:
    selected, cached, deferred = [], 0, 0
    for employer in employers:
        if not refresh and store.get(employer):
            cached += 1
        elif not refresh and store.deferred(employer):
            deferred += 1
        elif len(selected) < limit:
            selected.append(employer)
    return selected, {
        "eligible_employers": len(employers),
        "cached_skipped": cached,
        "deferred_skipped": deferred,
        "selected": len(selected),
    }


def research_batch(
    employers: list[dict],
    root: Path,
    produce: Callable[[list[str]], list[dict]],
    *,
    provider: str,
    model: str,
    provider_runs: list[dict],
    refresh: bool = False,
) -> dict:
    # The process-safe writer lock releases on interruption; no paid request is duplicated by concurrent runs.
    prepare_company_root(root)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with progress("proposal_cache_lock"), index_lock(root):
        store = ProposalStore(root)
        try:
            cached, pending, deferred = [], [], []
            for employer in employers:
                previous = store.get(employer) if not refresh else None
                if previous:
                    cached.append(previous)
                elif not refresh and store.deferred(employer):
                    deferred.append(employer["id"])
                else:
                    pending.append(employer)
            records = []
            if pending:
                try:
                    names = {e["name"].casefold(): e for e in pending}
                    if len(names) != len(pending):
                        raise ValueError("AI batch requires unique employer names")
                    proposals = produce([e["name"] for e in pending])
                    seen = set()
                    for proposal in proposals:
                        key = proposal["name"].casefold()
                        if key not in names or key in seen:
                            raise ValueError("Unknown or duplicate employer identity")
                        seen.add(key)
                        employer = names[key]
                        normalized = validate_proposal(proposal, employer)
                        unknown = [field for field in ("size", "offices") if not normalized[field]]
                        records.append(
                            {
                                "schema_version": SCHEMA_VERSION,
                                "identity_key": identity_key(employer),
                                "employer_id": employer["id"],
                                "employer_identity": employer,
                                "status": "unverified_proposal",
                                "researched_at": datetime.now(UTC).isoformat(),
                                "provider": provider,
                                "model": model,
                                "provider_runs": provider_runs.copy(),
                                "unknown_fields": unknown,
                                "staff_size_scope": "global bracket; Irish headcount unknown",
                                "proposal": normalized,
                            }
                        )
                    if len(records) != len(pending):
                        raise ValueError("Model omitted requested employer identities")
                    store.save(records)
                except Exception as exc:
                    store.fail(pending, getattr(exc, "category", type(exc).__name__))
                    raise
            event(
                "proposal_cache_outcome",
                requested=len(pending),
                cached=len(cached),
                deferred=len(deferred),
                cache=str(root / "proposals.sqlite3"),
            )
            return {
                "results": [*cached, *records],
                "requested": len(pending),
                "cache_hits": len(cached),
                "deferred_employer_ids": deferred,
            }
        finally:
            store.close()
