"""Lever postings API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.lever import parse_lever_payload as parse_lever_payload


def extract_lever_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Lever job boards."""
    opportunities: list[dict[str, Any]] = []

    m_lev = re.search(r"jobs\.lever\.co/([a-zA-Z0-9_-]+)", listing_url)
    if not m_lev and html_content:
        m_lev = re.search(r"jobs\.lever\.co/([a-zA-Z0-9_-]+)", html_content)
    if not m_lev:
        return opportunities

    lev_token = m_lev.group(1)
    lev_url = f"https://api.lever.co/v0/postings/{lev_token}?mode=json"
    lev_req = Request(lev_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with (request_opener or urlopen)(lev_req, timeout=10, context=get_ssl_context()) as r:
        lev_data = json.loads(r.read().decode())
        return parse_lever_payload(employer_name, lev_token, lev_data)
