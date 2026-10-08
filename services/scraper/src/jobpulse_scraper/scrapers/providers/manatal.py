"""Manatal career-page adapter (the ATS behind careers-page.com)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.manatal import parse_manatal_payload as parse_manatal_payload

_API = "https://open.api.manatal.com/open/v3/career-page/{slug}/jobs/"
_MAX_PAGES = 20


def _slug(listing_url: str) -> str:
    match = re.search(r"careers-page\.com/([A-Za-z0-9_-]+)", listing_url)
    if match:
        return match.group(1)
    match = re.search(r"career-page/([A-Za-z0-9_-]+)/jobs", listing_url)
    return match.group(1) if match else ""


def _get_json(url: str, *, request_opener: RequestOpener | None = None) -> dict[str, Any] | None:
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with (request_opener or urlopen)(request, timeout=15, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
            return payload if isinstance(payload, dict) else None
    except Exception:
        raise


def _employment_type(value: str) -> str:
    return {
        "full_time": "Full-Time",
        "part_time": "Part-Time",
        "contract": "Contract",
        "temporary": "Temporary",
        "freelance": "Freelance",
    }.get(value, "See job post")


def extract_manatal_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Manatal career page (full bodies inline)."""
    slug = _slug(listing_url)
    if not slug:
        return []
    url: str | None = _API.format(slug=slug)
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _ in range(_MAX_PAGES):
        if not url:
            break
        payload = _get_json(url, request_opener=request_opener)
        if not payload:
            break
        for job in parse_manatal_payload(employer_name, slug, payload):
            if job["url"] not in seen:
                seen.add(job["url"])
                opportunities.append(job)
        url = payload.get("next") or None
    return opportunities
