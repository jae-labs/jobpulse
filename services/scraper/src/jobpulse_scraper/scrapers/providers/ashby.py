"""AshbyHQ job board API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.ashby import parse_ashby_payload as parse_ashby_payload


def extract_ashby_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from AshbyHQ job boards."""
    opportunities: list[dict[str, Any]] = []

    m_ash = re.search(r"(?:jobs|api)\.ashbyhq\.com/(?:posting-api/job-board/)?([a-zA-Z0-9_.-]+)", listing_url)
    if not m_ash and html_content:
        m_ash = re.search(r"jobs\.ashbyhq\.com/([a-zA-Z0-9_.-]+)", html_content)
    if not m_ash:
        return opportunities

    ash_token = m_ash.group(1)
    ash_url = f"https://api.ashbyhq.com/posting-api/job-board/{ash_token}"
    ash_req = Request(ash_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with (request_opener or urlopen)(ash_req, timeout=10, context=get_ssl_context()) as r:
        ash_data = json.loads(r.read().decode())
        return parse_ashby_payload(employer_name, ash_token, ash_data)
