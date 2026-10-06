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

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_MAX_PAGES = 20
_CARD = re.compile(r"<li[^>]*iCIMS_JobCardItem[^>]*>(.*?)</li>", re.I | re.DOTALL)
_TITLE = re.compile(r"<h3[^>]*>(.*?)</h3>", re.I | re.DOTALL)
_HREF = re.compile(r'<a[^>]*href="([^"]*?/jobs/[^"]+?)"', re.I)
_LOCATION = re.compile(r'field-label">Location</span>\s*<span[^>]*>(.*?)</span>', re.I | re.DOTALL)
_DESCRIPTION = re.compile(r'col-xs-12 description">(.*?)</div>', re.I | re.DOTALL)


def _fetch(url: str, timeout: int = 15) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    with urlopen(request, timeout=timeout, context=get_ssl_context()) as response:
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
    employer_name: str,
    listing_url: str,
    html_content: str = "",
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
                page_html = _fetch(url)
            except Exception:
                break
        cards = _CARD.findall(page_html)
        if not cards:
            break
        for card in cards:
            title_match = _TITLE.search(card)
            href_match = _HREF.search(card)
            if not title_match or not href_match:
                continue
            title = clean_text(title_match.group(1))
            job_url = html.unescape(href_match.group(1)).split("?")[0]
            location_match = _LOCATION.search(card)
            location, is_irish = _location(location_match.group(1) if location_match else "")
            if not is_irish or not title or job_url in seen_urls:
                continue
            seen_urls.add(job_url)
            description_match = _DESCRIPTION.search(card)
            description = clean_text(description_match.group(1)) if description_match else ""
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": "See job post",
                    "salary_text": extract_salary_from_context(description or location, title),
                    "description": description or f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )
        if 'rel="next"' not in page_html:
            break
    return opportunities
