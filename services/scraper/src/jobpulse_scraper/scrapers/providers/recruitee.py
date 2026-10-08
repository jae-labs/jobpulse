"""Recruitee public offers API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.recruitee import parse_recruitee_payload as parse_recruitee_payload


def extract_recruitee_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Recruitee public company offers API."""
    opportunities: list[dict[str, Any]] = []

    match = re.search(r"https?://([a-zA-Z0-9_-]+)\.recruitee\.com", listing_url, re.IGNORECASE)
    if not match:
        return opportunities

    company_slug = match.group(1).lower()
    api_url = f"https://{company_slug}.recruitee.com/api/offers/"

    req = Request(
        api_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
            "Accept": "application/json",
        },
    )
    with (request_opener or urlopen)(req, timeout=12, context=get_ssl_context()) as resp:
        data = json.loads(resp.read().decode())
        return parse_recruitee_payload(employer_name, company_slug, data)
    return opportunities
