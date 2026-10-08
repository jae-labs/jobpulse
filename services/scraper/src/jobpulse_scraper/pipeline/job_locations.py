"""Post-scrape, source-backed vacancy geocoding; never uses company headquarters."""

from __future__ import annotations

import json
import math
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from jobpulse_scraper.database.client import get_supabase, retry_supabase
from jobpulse_scraper.database.records import response_count, response_object, response_records
from jobpulse_scraper.paths import REPO_ROOT
from jobpulse_scraper.pipeline.company_research import GEOAPIFY_API, ResearchClient, ResearchError, ResearchProvider


def verify_location(researcher: ResearchProvider, location: str, key: str) -> dict[str, Any]:
    evidence: dict[str, Any] = {
        "location": location,
        "provider": "Geoapify",
        "source": GEOAPIFY_API,
        "checked_at": datetime.now(UTC).isoformat(),
        "status": "unresolved",
    }
    text = location.strip()
    if re.search(r"\b(remote|worldwide|anywhere)\b", text, re.I):
        return {**evidence, "status": "remote"}
    if (
        not text
        or len(text) > 500
        or text.casefold() in {"unknown", "not specified", "multiple locations", "various locations"}
    ):
        return evidence
    params = {"text": text, "format": "json", "limit": "2", "apiKey": key}
    if re.search(r"\b(ireland|éire)\b", text, re.I) and not re.search(r"\bnorthern ireland\b", text, re.I):
        params["filter"] = "countrycode:ie"
    results = researcher.get(GEOAPIFY_API, params).get("results", [])
    if not results:
        return evidence
    best = results[0]
    lat, lon = best.get("lat"), best.get("lon")
    confidence = best.get("rank", {}).get("confidence", 0)
    precision = best.get("result_type")
    if (
        not isinstance(lat, (int, float))
        or isinstance(lat, bool)
        or not isinstance(lon, (int, float))
        or isinstance(lon, bool)
        or not math.isfinite(lat)
        or not math.isfinite(lon)
        or not -90 <= lat <= 90
        or not -180 <= lon <= 180
        or not isinstance(confidence, (int, float))
        or isinstance(confidence, bool)
        or not 0.8 <= confidence <= 1
        or precision
        not in {"building", "street", "postcode", "city", "district", "county", "state", "country", "amenity"}
    ):
        return evidence
    if len(results) > 1:
        other = results[1]
        other_confidence = other.get("rank", {}).get("confidence", 0)
        if other_confidence >= confidence - 0.05 and (
            abs(other.get("lat", lat) - lat) > 0.1 or abs(other.get("lon", lon) - lon) > 0.1
        ):
            return {**evidence, "status": "ambiguous"}
    return {
        **evidence,
        "status": "verified",
        "latitude": lat,
        "longitude": lon,
        "confidence": confidence,
        "precision": precision,
        "formatted": best.get("formatted"),
    }


def verify_catalog_locations(*, apply: bool = False, limit: int = 100, report: Path | None = None) -> dict[str, int]:
    client = get_supabase()
    key = os.environ.get("GEOAPIFY_API_KEY", "")
    if not key:
        raise ValueError("GEOAPIFY_API_KEY is not configured in the scraper backend environment")
    if limit <= 0:
        raise ValueError("limit must be positive")
    counts = {
        "checked": 0,
        "verified": 0,
        "remote": 0,
        "unresolved": 0,
        "ambiguous": 0,
        "failed": 0,
        "updated": 0,
        "conflicts": 0,
    }
    records, batch = [], []
    if report:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.with_suffix(".jsonl").write_text("")
    cursor = None
    cache = REPO_ROOT / ".backups/job-location-cache"
    with httpx.Client(
        timeout=20, headers={"User-Agent": "JobPulseJobLocations/1.0 (+https://github.com/jae-labs/jobpulse)"}
    ) as http:
        researcher = ResearchClient(cache, http)
        while counts["checked"] < limit:
            query = client.table("jobs").select("id,location,location_verification").order("id").limit(500)
            if cursor is not None:
                query = query.gt("id", cursor)
            rows = response_records(retry_supabase(query.execute).data)
            for row in rows:
                cursor = row["id"]
                previous = row.get("location_verification")
                if (
                    isinstance(previous, dict)
                    and previous.get("location") == row["location"]
                    and previous.get("status") in {"verified", "remote", "unresolved", "ambiguous"}
                ):
                    continue
                if counts["checked"] >= limit:
                    break
                counts["checked"] += 1
                try:
                    evidence = {"id": row["id"], **verify_location(researcher, row["location"], key)}
                except ResearchError:
                    counts["failed"] += 1
                    records.append({"id": row["id"], "status": "provider_failed"})
                    if counts["failed"] >= 5:
                        break
                    continue
                counts[evidence["status"]] += 1
                records.append(evidence)
                batch.append(evidence)
                if apply and len(batch) >= 100:
                    result = response_object(
                        retry_supabase(
                            lambda batch=batch: client.rpc(
                                "apply_job_location_verifications", {"p_records": batch}
                            ).execute()
                        ).data
                    )
                    counts["updated"] += response_count(result["updated"])
                    counts["conflicts"] += response_count(result["conflicts"])
                    batch = []
                if report and counts["checked"] % 100 == 0:
                    with report.with_suffix(".jsonl").open("a") as stream:
                        for record in records[-100:]:
                            stream.write(json.dumps(record) + "\n")
                    print(json.dumps(counts, sort_keys=True), flush=True)
            if len(rows) < 500 or counts["failed"] >= 5:
                break
        if apply and batch:
            result = response_object(
                retry_supabase(
                    lambda batch=batch: client.rpc("apply_job_location_verifications", {"p_records": batch}).execute()
                ).data
            )
            counts["updated"] += response_count(result["updated"])
            counts["conflicts"] += response_count(result["conflicts"])
    if report:
        report.write_text(json.dumps({"counts": counts, "records": records}, indent=2) + "\n")
    return counts
