"""Phenom People career-site adapter (POST ``/widgets``)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.phenom import parse_phenom_payload as parse_phenom_payload

_PAGE = 100
_MAX_PAGES = 20
_MAX_DETAILS = 60


def _post(host: str, body: dict[str, Any], *, request_opener: RequestOpener | None = None) -> dict[str, Any] | None:
    data = json.dumps(body).encode()
    request = Request(
        f"https://{host}/widgets",
        data=data,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with (request_opener or urlopen)(request, timeout=15, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
            return payload if isinstance(payload, dict) else None
    except Exception:
        raise


def _job_url(host: str, locale: str, seq: str) -> str:
    if "_" in locale:
        lang, country = locale.split("_", 1)
        if lang and country:
            return f"https://{host}/{country.lower()}/{lang.lower()}/job/{seq}"
    return f"https://{host}/job/{seq}"


def extract_phenom_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Phenom career site."""
    match = re.search(r"https?://([^/?#]+)", listing_url)
    host = match.group(1).lower() if match else ""
    if not host or "." not in host:
        return []

    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in range(_MAX_PAGES):
        payload = _post(
            host,
            {"deviceType": "desktop", "ddoKey": "refineSearch", "jobs": True, "from": page * _PAGE, "size": _PAGE},
            request_opener=request_opener,
        )
        if not payload:
            break
        jobs = ((payload.get("refineSearch") or {}).get("data") or {}).get("jobs") or []
        if not jobs:
            break
        details = {}
        from jobpulse_scraper.runtime.lease import active_lease

        if active_lease.get() is None:
            for job in parse_phenom_payload(employer_name, host, payload)[:_MAX_DETAILS]:
                seq = job["url"].rstrip("/").rsplit("/", 1)[-1]
                details[seq] = _post(
                    host,
                    {"deviceType": "desktop", "ddoKey": "jobDetail", "pageName": "job-details", "jobSeqNo": seq},
                    request_opener=request_opener,
                )
        for job in parse_phenom_payload(employer_name, host, payload, details):
            if job["url"] not in seen:
                seen.add(job["url"])
                opportunities.append(job)
        if len(jobs) < _PAGE:
            break
    return opportunities
