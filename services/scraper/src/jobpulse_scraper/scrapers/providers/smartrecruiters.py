"""SmartRecruiters postings API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.smartrecruiters import (
    parse_smartrecruiters_payload as parse_smartrecruiters_payload,
)


def extract_smartrecruiters_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from SmartRecruiters portals."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    m_sr = re.search(r"careers\.smartrecruiters\.com/([a-zA-Z0-9_-]+)", listing_url)
    if not m_sr and html_content:
        m_sr = re.search(r"careers\.smartrecruiters\.com/([a-zA-Z0-9_-]+)", html_content)
    if not m_sr:
        return opportunities

    sr_token = m_sr.group(1)
    offset = 0
    for _ in range(20):
        sr_url = f"https://api.smartrecruiters.com/v1/companies/{sr_token}/postings?limit=100&offset={offset}"
        sr_req = Request(sr_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with (request_opener or urlopen)(sr_req, timeout=10, context=get_ssl_context()) as r:
            sr_data = json.loads(r.read().decode())
            page_jobs = parse_smartrecruiters_payload(employer_name, sr_token, sr_data)
            for record in page_jobs:
                if record["url"] not in seen_urls:
                    seen_urls.add(record["url"])
                    opportunities.append(record)

        offset += len(sr_data["content"])
        if not sr_data["content"] or offset >= sr_data.get("totalFound", offset):
            break
    else:
        raise ValueError("SmartRecruiters listing exceeded the page limit")

    return opportunities
