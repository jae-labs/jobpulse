"""iCIMS job board adapter.

The board's ``in_iframe=1`` listing is server-rendered and carries each posting's
title, location and link, so the adapter reads the listing pages directly instead
of fetching every detail page. Location is prefixed with an ISO country code
(``IE-Cork-Cork``), which makes the Ireland filter exact.
"""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.engine.text_cleaner import clean_text
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.icims import parse_icims_page as parse_icims_page
from jobpulse_scraper.scrapers.providers.location import is_explicit_ireland_location

_MAX_PAGES = 20
_CARD = re.compile(r"<li[^>]*iCIMS_JobCardItem[^>]*>(.*?)</li>", re.I | re.DOTALL)
_TITLE = re.compile(r"<h3[^>]*>(.*?)</h3>", re.I | re.DOTALL)
_HREF = re.compile(r'<a[^>]*href="([^"]*?/jobs/[^"]+?)"', re.I)
_LOCATION = re.compile(r'field-label">Location</span>\s*<span[^>]*>(.*?)</span>', re.I | re.DOTALL)
_DESCRIPTION = re.compile(r'col-xs-12 description">(.*?)</div>', re.I | re.DOTALL)


def _fetch(url: str, timeout: int = 15, *, request_opener: RequestOpener | None = None) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    with (request_opener or urlopen)(request, timeout=timeout, context=get_ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def _location(raw: str) -> tuple[str, bool]:
    """Return (display, is_irish). Country-coded locations are authoritative."""
    text = clean_text(html.unescape(raw))
    prefixed = re.match(r"^([A-Za-z]{2})-(.+)$", text)
    if prefixed:
        country = prefixed.group(1).upper()
        place = re.sub(r"-\s*", ", ", prefixed.group(2)).strip()
        display = f"{place}, Ireland" if country == "IE" else f"{place}, {country}"
        return display, country == "IE"
    return text, is_explicit_ireland_location(text)


def extract_icims_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from an iCIMS board listing."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    match = re.search(r"https?://([a-z0-9.-]+\.icims\.com)", listing_url, re.I)
    if not match and html_content:
        match = re.search(r"https?://([a-z0-9.-]+\.icims\.com)", html_content, re.I)
    if not match:
        return opportunities

    host = match.group(1)
    for page in range(_MAX_PAGES):
        if page == 0 and html_content:
            page_html = html_content
        else:
            url = f"https://{host}/jobs/search?ss=1&searchRelation=keyword_all&in_iframe=1&pr={page}"
            try:
                page_html = _fetch(url, request_opener=request_opener)
            except Exception:
                raise
        cards = _CARD.findall(page_html)
        if not cards:
            break
        for job in parse_icims_page(employer_name, page_html):
            if job["url"] not in seen_urls:
                seen_urls.add(job["url"])
                opportunities.append(job)
        if 'rel="next"' not in page_html:
            break
    return opportunities
