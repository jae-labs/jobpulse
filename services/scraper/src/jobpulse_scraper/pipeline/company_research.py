"""Read-only external employer research. Results are proposals, not verified facts."""

from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import re
import sys
import threading
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit

import httpx

from jobpulse_scraper.pipeline.stored_employer_evidence import company_identity_key


class ResearchProvider(Protocol):
    def get(self, url: str, params: dict[str, str]) -> dict[str, Any]: ...


WIKIDATA_API = "https://www.wikidata.org/w/api.php"
GEOAPIFY_API = "https://api.geoapify.com/v1/geocode/search"
_LOG_LOCK = threading.Lock()
BLOCKED_NAMES = {
    "jobsireland employer",
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
        self._request_lock = threading.Lock()
        self._metrics_lock = threading.Lock()
        self._requests = 0
        self._cache_hits = 0
        self._request_seconds = 0.0
        self._rate_limits = 0
        cache.mkdir(parents=True, exist_ok=True)

    def reserve_geocoding_request(self) -> None:
        """Shared conservative daily allowance for employer and job lookup workers."""
        date = datetime.now(UTC).date().isoformat()
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

    def _event(self, event: str, url: str, **fields: Any) -> None:
        with _LOG_LOCK:
            print(
                json.dumps({"research_event": event, "endpoint": urlsplit(url).path, **fields}),
                file=sys.stderr,
                flush=True,
            )

    def metrics(self) -> dict[str, Any]:
        with self._metrics_lock:
            return {
                "requests": self._requests,
                "cache_hits": self._cache_hits,
                "request_seconds": round(self._request_seconds, 3),
                "rate_limits": self._rate_limits,
            }

    def _geoapify_gate(self, delay: float = 0, *, url: str = GEOAPIFY_API) -> None:
        """Coordinate request starts and cooldowns across threads and local processes."""
        path = self.cache.parent / "geoapify-transport.json"
        with path.with_suffix(".lock").open("a+") as stream:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            state = json.loads(path.read_text()) if path.exists() else {}
            now = time.time()
            if delay:
                state["cooldown_until"] = max(state.get("cooldown_until", 0), now + delay)
            else:
                wait = max(0, state.get("next_start", 0) - now, state.get("cooldown_until", 0) - now)
                if wait > 30:
                    raise ResearchError("Provider cooling down; retry after the saved deadline")
                if wait:
                    self._event("pacing", url, wait_seconds=round(wait, 3))
                    time.sleep(wait)
                self.reserve_geocoding_request()
                state["next_start"] = time.time() + self.interval
            temporary = path.with_suffix(f".{os.getpid()}.tmp")
            temporary.write_text(json.dumps(state))
            temporary.replace(path)

    def get(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        public_params = {k: v for k, v in params.items() if k != "apiKey"}
        digest = hashlib.sha256(json.dumps([url, public_params], sort_keys=True).encode()).hexdigest()
        locks = self.cache.parent / ".research-locks"
        locks.mkdir(parents=True, exist_ok=True)
        # Keep the lock outside the response cache; failures never publish a body.
        with (locks / f"{digest}.lock").open("a+") as stream:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            return self._get(url, params, self.cache / f"{digest}.json")

    def _get(self, url: str, params: dict[str, str], path: Path) -> dict[str, Any]:
        if path.exists() and time.time() - path.stat().st_mtime < 30 * 86400:
            with self._metrics_lock:
                self._cache_hits += 1
            self._event("cache_hit", url)
            return json.loads(path.read_text())
        for attempt in range(3):
            geoapify = url.startswith("https://api.geoapify.com/")
            if geoapify:
                self._geoapify_gate(url=url)
            else:
                with self._request_lock:
                    time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
                    self.last_request = time.monotonic()
            started = time.monotonic()
            with self._metrics_lock:
                self._requests += 1
            self._event("request_sent", url, attempt=attempt + 1)
            try:
                response = self.client.get(url, params=params)
            except httpx.HTTPError:
                elapsed = time.monotonic() - started
                with self._metrics_lock:
                    self._request_seconds += elapsed
                self._event("request_failed", url, elapsed_seconds=round(elapsed, 3), error_code="connection_failed")
                raise ResearchError("Provider connection failed") from None
            elapsed = time.monotonic() - started
            with self._metrics_lock:
                self._request_seconds += elapsed
            self._event("response_received", url, status=response.status_code, elapsed_seconds=round(elapsed, 3))
            if response.status_code == 429 or response.status_code >= 500:
                retry_after = response.headers.get("Retry-After", "")
                delay = float(2 ** (attempt + 1))
                if retry_after.isdigit():
                    delay = max(delay, float(retry_after))
                elif retry_after:
                    try:
                        delay = max(delay, parsedate_to_datetime(retry_after).timestamp() - time.time())
                    except (ValueError, TypeError, OverflowError):
                        pass
                if geoapify and response.status_code == 429:
                    with self._metrics_lock:
                        self._rate_limits += 1
                    self._geoapify_gate(delay, url=url)
                    if delay > 30:
                        raise ResearchError("Provider cooling down; retry after the saved deadline")
                if attempt < 2:
                    if not (geoapify and response.status_code == 429):
                        time.sleep(delay)
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
