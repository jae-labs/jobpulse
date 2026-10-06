"""Dayforce (formerly Ceridian) careers-board adapter.

Every Dayforce career site is served from the single host ``jobs.dayforcehcm.com``
under ``/<culture>/<tenant>/<site>``; a board is the ``<tenant>/<site>`` pair. The
listing is a POST JSON API guarded by next-auth's double-submit CSRF pair: a GET to
``/api/auth/csrf`` sets a cookie and returns the token half, which must be echoed in
an ``X-CSRF-TOKEN`` header on the listing POST. The listing carries each posting's
whole description, so no per-posting detail request is needed.
"""

from __future__ import annotations

import html
import http.cookiejar
import json
import re
from typing import Any
from urllib.request import HTTPCookieProcessor, HTTPSHandler, Request, build_opener

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import get_ssl_context
from scrapers.providers.location import is_explicit_ireland_location

_BASE_URL = "https://jobs.dayforcehcm.com"
_CSRF_PATH = "/api/auth/csrf"
_CSRF_HEADER = "X-CSRF-TOKEN"
_PAGE_SIZE = 25
_MAX_PAGES = 40  # safety cap: up to 1,000 postings scanned per board

_BOARD_PATTERN = re.compile(
    r"jobs\.dayforcehcm\.com/(?:([a-z]{2}-[A-Z]{2})/)?([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)",
    re.I,
)


def parse_dayforce_board(listing_url: str) -> tuple[str, str, str]:
    """Split a Dayforce URL into ``(tenant, site, culture)``, culture defaulting to en-US."""
    match = _BOARD_PATTERN.search(listing_url or "")
    if not match:
        return "", "", ""
    return match.group(2), match.group(3), match.group(1) or "en-US"


def _build_opener():
    """An opener with a cookie jar, so the CSRF cookie rides the listing POST."""
    jar = http.cookiejar.CookieJar()
    return build_opener(HTTPCookieProcessor(jar), HTTPSHandler(context=get_ssl_context()))


def _csrf_token(opener) -> str:
    request = Request(
        _BASE_URL + _CSRF_PATH,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with opener.open(request, timeout=15) as response:
        payload = json.loads(response.read().decode())
    return str(payload.get("csrfToken") or "") if isinstance(payload, dict) else ""


def _search_page(opener, token: str, tenant: str, site: str, culture: str, start: int) -> dict[str, Any]:
    body = json.dumps(
        {
            "clientNamespace": tenant,
            "jobBoardCode": site,
            "cultureCode": culture,
            "paginationStart": start,
        }
    ).encode()
    request = Request(
        f"{_BASE_URL}/api/geo/{tenant}/jobposting/search",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",
            _CSRF_HEADER: token,
        },
    )
    with opener.open(request, timeout=15) as response:
        payload = json.loads(response.read().decode())
    return payload if isinstance(payload, dict) else {}


def _location(posting: dict[str, Any]) -> tuple[str, bool]:
    """Return the display location and whether any part states Ireland."""
    places: list[str] = []
    ireland = False
    for place in posting.get("postingLocations") or []:
        if not isinstance(place, dict):
            continue
        code = str(place.get("isoCountryCode") or "").upper()
        if code == "IE":
            ireland = True
        parts = [str(place.get(key) or "").strip() for key in ("cityName", "stateCode", "isoCountryCode")]
        label = ", ".join(part for part in parts if part)
        if label:
            places.append(label)
    text = "; ".join(dict.fromkeys(places))
    return text, ireland


def extract_dayforce_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Dayforce career site."""
    tenant, site, culture = parse_dayforce_board(listing_url)
    if not tenant or not site:
        return []

    try:
        opener = _build_opener()
        token = _csrf_token(opener)
    except Exception:
        return []
    if not token:
        return []

    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in range(_MAX_PAGES):
        try:
            payload = _search_page(opener, token, tenant, site, culture, page * _PAGE_SIZE)
        except Exception:
            break
        postings = payload.get("jobPostings") or []
        if not postings:
            break
        for posting in postings:
            if not isinstance(posting, dict):
                continue
            location, ireland = _location(posting)
            if not ireland and not is_explicit_ireland_location(location):
                continue
            title = str(posting.get("jobTitle") or "").strip()
            posting_id = posting.get("jobPostingId")
            if not title or posting_id is None:
                continue
            job_url = f"{_BASE_URL}/{culture}/{tenant}/{site}/jobs/{posting_id}"
            if job_url in seen:
                continue
            seen.add(job_url)
            description = clean_html_description(html.unescape(str(posting.get("jobDescription") or "")))
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location or "Ireland",
                    "employment_type": "See job post",
                    "salary_text": extract_salary_from_context(description, title),
                    "description": description or f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )
        max_count = payload.get("maxCount") or 0
        if max_count and (page + 1) * _PAGE_SIZE >= max_count:
            break

    return opportunities
