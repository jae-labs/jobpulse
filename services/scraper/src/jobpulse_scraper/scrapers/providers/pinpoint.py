"""Pinpoint public postings adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.pinpoint import parse_pinpoint_payload as parse_pinpoint_payload


def extract_pinpoint_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Pinpoint boards (``<tenant>.pinpointhq.com/postings.json``)."""
    opportunities: list[dict[str, Any]] = []

    match = re.search(r"https?://([a-zA-Z0-9-]+)\.pinpointhq\.com", listing_url)
    if not match and html_content:
        match = re.search(r"([a-zA-Z0-9-]+)\.pinpointhq\.com", html_content)
    if not match:
        return opportunities

    token = match.group(1)
    request = Request(
        f"https://{token}.pinpointhq.com/postings.json",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with (request_opener or urlopen)(request, timeout=10, context=get_ssl_context()) as response:
        payload = json.loads(response.read().decode())
    return parse_pinpoint_payload(employer_name, token, payload)
    return opportunities
