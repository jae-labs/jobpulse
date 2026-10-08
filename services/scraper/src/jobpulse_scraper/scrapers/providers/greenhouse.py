"""Greenhouse job-boards API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.greenhouse import parse_greenhouse_payload as parse_greenhouse_payload


def extract_greenhouse_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Greenhouse boards."""
    opportunities: list[dict[str, Any]] = []

    m_gh = re.search(
        r"(?:job-boards|boards)(?:-api)?\.greenhouse\.io/(?:embed/job_board\?for=|v1/boards/)?([a-zA-Z0-9_-]+)",
        listing_url,
    )
    if not m_gh and html_content:
        m_gh = re.search(
            r"(?:job-boards|boards)\.greenhouse\.io/(?:embed/job_board\?for=)?([a-zA-Z0-9_-]+)", html_content
        )
    if not m_gh:
        return opportunities

    gh_token = m_gh.group(1)
    gh_url = f"https://boards-api.greenhouse.io/v1/boards/{gh_token}/jobs?content=true"
    gh_req = Request(gh_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with (request_opener or urlopen)(gh_req, timeout=10, context=get_ssl_context()) as r:
        gh_data = json.loads(r.read().decode())
        return parse_greenhouse_payload(employer_name, gh_token, gh_data)
