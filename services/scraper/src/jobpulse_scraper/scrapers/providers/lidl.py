"""Lidl Ireland REST API adapter."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.lidl import parse_lidl_payload as parse_lidl_payload


def extract_lidl_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Lidl Ireland careers API."""
    opportunities: list[dict[str, Any]] = []

    if not ("jobs.lidl.ie" in listing_url or "careers.lidl.ie" in listing_url):
        return opportunities

    lidl_req = Request(
        "https://jobs.lidl.ie/api/v1/search",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with (request_opener or urlopen)(lidl_req, timeout=10, context=get_ssl_context()) as r:
        data = json.loads(r.read().decode())
        return parse_lidl_payload(employer_name, listing_url, data)
    return opportunities
