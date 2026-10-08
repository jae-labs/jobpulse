"""Rippling ATS public board adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.rippling import parse_rippling_payload as parse_rippling_payload

_MAX_PAGES = 10
_PAGE_SIZE = 50


def extract_rippling_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Rippling ATS boards (``ats.rippling.com/api/v2/board/<token>/jobs``)."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    match = re.search(r"ats\.rippling\.com/([a-zA-Z0-9_-]+)", listing_url)
    if not match and html_content:
        match = re.search(r"ats\.rippling\.com/([a-zA-Z0-9_-]+)", html_content)
    if not match:
        return opportunities

    token = match.group(1)
    for page in range(_MAX_PAGES):
        request = Request(
            f"https://ats.rippling.com/api/v2/board/{token}/jobs?page={page}&pageSize={_PAGE_SIZE}",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        with (request_opener or urlopen)(request, timeout=10, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
        page_jobs = parse_rippling_payload(employer_name, token, payload)
        items = payload["items"]
        if not items:
            break
        for record in page_jobs:
            if record["url"] not in seen_urls:
                seen_urls.add(record["url"])
                opportunities.append(record)
        total_pages = payload.get("totalPages")
        if isinstance(total_pages, int) and page + 1 >= total_pages:
            break

    else:
        raise ValueError("rippling listing exceeded the page limit")

    return opportunities
