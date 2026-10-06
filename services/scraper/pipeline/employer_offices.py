"""Bounded post-scrape company-place discovery, independent of vacancy coordinates."""

from __future__ import annotations

import ipaddress
import math
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

from database.client import get_supabase, retry_supabase
from database.records import response_records
from pipeline.company_research import BLOCKED_NAMES, GEOAPIFY_API, ResearchClient, ResearchError, ResearchProvider
from pipeline.stored_employer_evidence import company_identity_key

PLACES_API = "https://api.geoapify.com/v2/places"
DETAILS_API = "https://api.geoapify.com/v2/place-details"


def website_domain(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    host = None
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
            return None
        ipaddress.ip_address(host)
        return None
    except ValueError:
        return host.lower().removeprefix("www.") if host and "." in host else None


def discover_offices(researcher: ResearchProvider, employer: dict[str, Any], key: str) -> dict[str, Any]:
    name, location = employer["name"], employer["location"]
    record = {**employer, "status": "unresolved", "offices": []}
    if re.search(r"\b(remote|worldwide|anywhere)\b", location, re.I):
        return {**record, "status": "remote"}
    if " ".join(name.casefold().split()) in BLOCKED_NAMES:
        return record
    places = researcher.get(GEOAPIFY_API, {"text": location, "format": "json", "limit": "2", "apiKey": key})
    regions = places.get("results")
    if not isinstance(regions, list):
        raise ResearchError("Invalid place boundary response")
    if not regions:
        return record
    if any(not isinstance(r, dict) or not isinstance(r.get("rank", {}), dict) for r in regions):
        raise ResearchError("Invalid place boundary response")
    region = regions[0]
    confidence = region.get("rank", {}).get("confidence", 0)
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0.8 <= confidence <= 1:
        return record
    other_confidence = regions[1].get("rank", {}).get("confidence", 0) if len(regions) > 1 else 0
    if not isinstance(other_confidence, (int, float)) or isinstance(other_confidence, bool):
        raise ResearchError("Invalid place boundary confidence")
    if len(regions) > 1 and other_confidence >= confidence - 0.05:
        return {**record, "status": "ambiguous"}
    # A provider boundary, not a radius around a city centroid, prevents nearby-city matches.
    if not region.get("place_id") or region.get("result_type") not in {
        "city",
        "district",
        "county",
        "state",
        "country",
    }:
        return record
    data = researcher.get(
        PLACES_API,
        {
            "name": name,
            "categories": "office,commercial,education,healthcare,production",
            "filter": f"place:{region['place_id']}",
            "limit": "20",
            "apiKey": key,
        },
    )
    features = data.get("features")
    if not isinstance(features, list):
        raise ResearchError("Invalid business search response")
    if any(
        not isinstance(f, dict)
        or not isinstance(f.get("properties"), dict)
        or not isinstance(f["properties"].get("name", ""), str)
        for f in features
    ):
        raise ResearchError("Invalid business search response")
    if len(features) >= 20:
        return {**record, "status": "ambiguous"}  # Do not present a truncated search as exhaustive.
    matches = [
        f
        for f in features
        if company_identity_key(f.get("properties", {}).get("name", "")) == company_identity_key(name)
    ]
    if len(matches) > 5:
        return {**record, "status": "ambiguous"}
    known_domain = website_domain(employer.get("website"))
    offices = {}
    for feature in matches:
        props = feature.get("properties", {})
        if company_identity_key(props.get("name", "")) != company_identity_key(name):
            continue
        place_id = props.get("place_id")
        if not isinstance(place_id, str) or not place_id:
            continue
        details = researcher.get(DETAILS_API, {"id": place_id, "features": "details", "apiKey": key})
        detail_features = details.get("features")
        if not isinstance(detail_features, list) or not detail_features:
            raise ResearchError("Invalid business details response")
        if not isinstance(detail_features[0], dict) or not isinstance(detail_features[0].get("properties"), dict):
            raise ResearchError("Invalid business details response")
        detail = detail_features[0]["properties"]
        website = detail.get("website")
        domain = website_domain(website)
        if known_domain and domain and domain != known_domain:
            continue
        lat, lon = props.get("lat"), props.get("lon")
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (lat, lon)):
            continue
        # A POI coordinate without a numbered street address is not a precise office address.
        if not -90 <= lat <= 90 or not -180 <= lon <= 180 or not props.get("street") or not props.get("housenumber"):
            continue
        address = props.get("formatted")
        if not isinstance(address, str) or not address:
            continue
        categories = props.get("categories", [])
        if not isinstance(categories, list):
            raise ResearchError("Invalid business categories")
        offices[place_id] = {
            "place_id": place_id,
            "name": props["name"],
            "address": address,
            "city": props.get("city"),
            "country_code": props.get("country_code"),
            "latitude": lat,
            "longitude": lon,
            "website": website if domain else employer.get("website") if known_domain else None,
            "website_domain": domain or known_domain,
            "categories": [c for c in categories if isinstance(c, str)],
        }
    return {**record, "status": "found" if offices else "unresolved", "offices": list(offices.values())}


def enrich_offices(*, apply: bool = False, limit: int = 25, report: Path | None = None) -> dict[str, int]:
    import json

    client = get_supabase()  # Loads backend credentials before checking the provider key.
    key = os.environ.get("GEOAPIFY_API_KEY", "")
    if not key:
        raise ValueError("GEOAPIFY_API_KEY is not configured")
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    counts = dict(checked=0, found=0, unresolved=0, ambiguous=0, remote=0, provider_failed=0, updated=0, conflicts=0)
    rows = response_records(
        retry_supabase(lambda: client.rpc("pending_employer_office_lookups", {"p_limit": limit}).execute()).data
    )
    records = []
    cache = Path(__file__).resolve().parents[3] / ".backups/employer-office-cache"
    with httpx.Client(
        timeout=httpx.Timeout(60, connect=10), headers={"User-Agent": "JobPulseEmployerOffices/1.0"}
    ) as http:
        researcher = ResearchClient(cache, http)
        for row in rows:
            try:
                record = discover_offices(researcher, row, key)
            except ResearchError:
                record = {**row, "status": "provider_failed", "offices": []}
            counts["checked"] += 1
            counts[record["status"]] += 1
            if apply:
                saved = retry_supabase(
                    lambda record=record: client.rpc("save_employer_office_lookup", {"p_record": record}).execute()
                ).data
                counts["updated" if saved else "conflicts"] += 1
            records.append(record)
            if report:
                report.parent.mkdir(parents=True, exist_ok=True)
                report.write_text(json.dumps({"counts": counts, "records": records}, indent=2) + "\n")
            if counts["provider_failed"] >= 5:
                break
    if report and not records:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps({"counts": counts, "records": []}, indent=2) + "\n")
    return counts
