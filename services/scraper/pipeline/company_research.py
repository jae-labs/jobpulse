"""Read-only external employer research. Results are proposals, not verified facts."""

from __future__ import annotations

import fcntl
import hashlib
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import httpx

from pipeline.stored_employer_evidence import company_identity_key


class ResearchProvider(Protocol):
    def get(self, url: str, params: dict[str, str]) -> dict[str, Any]: ...


WIKIDATA_API = "https://www.wikidata.org/w/api.php"
GEOAPIFY_API = "https://api.geoapify.com/v1/geocode/search"
BLOCKED_NAMES = {
    "jobsireland employer",
    "whatjobs",
    "unavailable",
    "company details confidential",
    "confidential",
    "undisclosed",
    "employer",
    "smartrecruiters",
    "lever",
    "hirehive",
    "zohorecruit",
    "jobgether",
    "acca careers",
    "joinimagine",
    "nextfrontiercapital",
}


class ResearchError(Exception):
    """Safe provider failure without a credential-bearing request URL."""


class ResearchClient:
    def __init__(self, cache: Path, client: httpx.Client, *, interval: float = 1.0) -> None:
        if not math.isfinite(interval) or interval < 1:
            raise ValueError("Request interval must be at least one second")
        self.cache, self.client, self.interval = cache, client, interval
        self.last_request = 0.0
        cache.mkdir(parents=True, exist_ok=True)

    def reserve_geocoding_request(self) -> None:
        """Shared conservative daily allowance for employer and job lookup workers."""
        date = datetime.now(timezone.utc).date().isoformat()
        path = self.cache.parent / f"geoapify-budget-{date}.txt"
        with path.open("a+") as stream:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            stream.seek(0)
            used = int(stream.read() or "0")
            if used >= 2500:
                raise ResearchError("Local daily Geoapify request allowance reached; resume tomorrow")
            stream.seek(0)
            stream.truncate()
            stream.write(str(used + 1))
            stream.flush()

    def get(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        public_params = {k: v for k, v in params.items() if k != "apiKey"}
        digest = hashlib.sha256(json.dumps([url, public_params], sort_keys=True).encode()).hexdigest()
        path = self.cache / f"{digest}.json"
        if path.exists() and time.time() - path.stat().st_mtime < 30 * 86400:
            return json.loads(path.read_text())
        for attempt in range(3):
            if url.startswith("https://api.geoapify.com/"):
                self.reserve_geocoding_request()
            time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = self.client.get(url, params=params)
            except httpx.HTTPError:
                raise ResearchError("Provider connection failed") from None
            if response.status_code == 429 or response.status_code >= 500:
                delay = response.headers.get("Retry-After", "")
                if attempt < 2:
                    time.sleep(min(30, int(delay)) if delay.isdigit() else 2 ** (attempt + 1))
                    continue
            if response.status_code != 200:
                raise ResearchError(f"Provider returned HTTP {response.status_code}")
            try:
                data = response.json()
            except ValueError:
                raise ResearchError("Provider returned invalid JSON") from None
            if not isinstance(data, dict) or "error" in data:
                raise ResearchError("Provider returned an invalid result or API error")
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False))
            temporary.replace(path)
            return data
        raise ResearchError("Provider retry limit reached")

    def entity(self, identity: str) -> dict[str, Any]:
        if not re.fullmatch(r"Q[1-9][0-9]*", identity):
            raise ResearchError("Invalid Wikidata identity")
        url = f"https://www.wikidata.org/wiki/Special:EntityData/{identity}.json"
        entity = self.get(url, {}).get("entities", {}).get(identity)
        if not isinstance(entity, dict) or "missing" in entity:
            raise ResearchError("Wikidata entity is unavailable")
        return entity

    def company(self, name: str) -> dict[str, Any]:
        result = self.get(
            WIKIDATA_API,
            {
                "action": "wbsearchentities",
                "search": company_identity_key(name),
                "language": "en",
                "format": "json",
                "type": "item",
                "limit": "10",
                "maxlag": "5",
            },
        )
        if not isinstance(result.get("search"), list):
            raise ResearchError("Wikidata search response is incomplete")
        exact = []
        for hit in result.get("search", []):
            names = [hit.get("label", ""), hit.get("match", {}).get("text", "")]
            if any(company_identity_key(label) == company_identity_key(name) for label in names):
                exact.append(hit["id"])
        exact = list(dict.fromkeys(exact))
        if len(exact) != 1:
            return {"outcome": "ambiguous" if exact else "not_found", "candidate_ids": exact}
        identity = exact[0]
        entity = self.entity(identity)
        claims = entity.get("claims", {})

        def values(prop: str) -> list[Any]:
            return [
                c["mainsnak"]["datavalue"]["value"]
                for c in claims.get(prop, [])
                if c.get("rank") != "deprecated" and "datavalue" in c.get("mainsnak", {})
            ]

        industries = []
        for industry in values("P452")[:5]:
            industry_entity = self.entity(industry["id"])
            industries.append(industry_entity.get("labels", {}).get("en", {}).get("value", industry["id"]))
        websites = [v for v in values("P856") if isinstance(v, str) and v.startswith("https://")]
        addresses = [
            v["text"] for v in values("P6375") if isinstance(v, dict) and v.get("language") == "en" and v.get("text")
        ]
        return {
            "outcome": "needs_review",
            "wikidata_id": identity,
            "description": entity.get("descriptions", {}).get("en", {}).get("value"),
            "sector_candidates": industries,
            "website_candidates": websites,
            "address_candidates": addresses,
            "sources": [f"https://www.wikidata.org/wiki/{identity}"],
            # P159 city coordinates are deliberately not an employer address.
            "location": None,
            "latitude": None,
            "longitude": None,
        }

    def geocode(self, address: str, api_key: str) -> dict[str, Any]:
        data = self.get(GEOAPIFY_API, {"text": address, "format": "json", "limit": "2", "apiKey": api_key})
        results = data.get("results", [])
        if not results:
            return {"outcome": "not_found"}
        row = results[0]
        lat, lon = row.get("lat"), row.get("lon")
        valid = (
            isinstance(lat, (int, float))
            and not isinstance(lat, bool)
            and isinstance(lon, (int, float))
            and not isinstance(lon, bool)
            and math.isfinite(lat)
            and math.isfinite(lon)
            and -90 <= lat <= 90
            and -180 <= lon <= 180
        )
        if not valid or row.get("result_type") not in {"building", "amenity"}:
            return {"outcome": "insufficient_precision", "result_type": row.get("result_type")}
        return {
            "outcome": "needs_review",
            "latitude": lat,
            "longitude": lon,
            "formatted": row.get("formatted"),
            "rank": row.get("rank"),
            "alternatives": results[1:],
            "sources": [GEOAPIFY_API],
            "attribution": "Geoapify / OpenStreetMap contributors",
        }
