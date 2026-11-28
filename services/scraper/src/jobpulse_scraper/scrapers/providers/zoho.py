"""Zoho Recruit career-site adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.engine.text_cleaner import clean_html_description
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.zoho import parse_zoho_page as parse_zoho_page

_JOBS_TAG = re.compile(r'<input[^>]*id=["\']jobs["\'][^>]*>', re.I | re.DOTALL)
_JOBS_VALUE = re.compile(r'value=["\'](.*?)["\']', re.I | re.DOTALL)
_DESCRIPTION = re.compile(r'"Job_Description"\s*:\s*"((?:[^"\\]|\\.)*)"', re.I)
_MAX_DETAILS = 60


def _fetch(url: str, timeout: int = 15, *, request_opener: RequestOpener | None = None) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    with (request_opener or urlopen)(request, timeout=timeout, context=get_ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def _description(host: str, opening_id: str, *, request_opener: RequestOpener | None = None) -> str:
    try:
        page = _fetch(f"https://{host}/jobs/Careers/{opening_id}", request_opener=request_opener)
    except Exception:
        return ""
    match = _DESCRIPTION.search(page)
    if not match:
        return ""
    try:
        raw = json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        raw = match.group(1)
    return clean_html_description(raw)


def extract_zoho_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Zoho Recruit careers page."""
    match = re.search(r"https?://([a-z0-9.-]+\.zohorecruit\.[a-z.]+)", listing_url, re.I)
    if not match and html_content:
        match = re.search(r"https?://([a-z0-9.-]+\.zohorecruit\.[a-z.]+)", html_content, re.I)
    if not match:
        return []
    host = match.group(1)
    page = _fetch(f"https://{host}/jobs/Careers", request_opener=request_opener)
    details = {}
    from jobpulse_scraper.runtime.lease import active_lease

    if active_lease.get() is None:
        for job in parse_zoho_page(employer_name, host, page)[:_MAX_DETAILS]:
            opening_id = job["url"].rsplit("/", 1)[-1]
            details[opening_id] = _description(host, opening_id, request_opener=request_opener)
    return parse_zoho_page(employer_name, host, page, details)
