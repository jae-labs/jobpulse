"""Breezy HR public JSON adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.breezy import parse_breezy_payload as parse_breezy_payload


def extract_breezy_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Breezy HR boards (``<tenant>.breezy.hr/json``)."""
    opportunities: list[dict[str, Any]] = []

    match = re.search(r"https?://([a-zA-Z0-9-]+)\.breezy\.hr", listing_url)
    if not match and html_content:
        match = re.search(r"([a-zA-Z0-9-]+)\.breezy\.hr", html_content)
    if not match:
        return opportunities

    token = match.group(1)
    request = Request(
        f"https://{token}.breezy.hr/json",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with (request_opener or urlopen)(request, timeout=10, context=get_ssl_context()) as response:
        data = json.loads(response.read().decode())
    return parse_breezy_payload(employer_name, token, data)
    return opportunities
