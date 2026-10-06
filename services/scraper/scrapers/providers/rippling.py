"""Rippling ATS public board adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_MAX_PAGES = 10
_PAGE_SIZE = 50


def _irish_location(locations: Any) -> str:
    """Return the first Irish location text, or "" when none is Irish."""
    if not isinstance(locations, list):
        return ""
    fallback = ""
    for loc in locations:
        if not isinstance(loc, dict):
            continue
        name = str(loc.get("name") or "").strip()
        if not fallback:
            fallback = name
        if str(loc.get("countryCode") or "").upper() == "IE" or "ireland" in str(loc.get("country") or "").lower():
            return name or "Ireland"
        if is_explicit_ireland_location(name):
            return name
    return ""


def extract_rippling_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Rippling ATS boards (``ats.rippling.com/api/v2/board/<token>/jobs``)."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    match = re.search(r"ats\.rippling\.com/([a-zA-Z0-9_-]+)", listing_url)
    if not match and html_content:
        match = re.search(r"ats\.rippling\.com/([a-zA-Z0-9_-]+)", html_content)
    if not match:
        return opportunities

    token = match.group(1)
    for page in range(_MAX_PAGES):
        request = Request(
            f"https://ats.rippling.com/api/v2/board/{token}/jobs?page={page}&pageSize={_PAGE_SIZE}",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        with urlopen(request, timeout=10, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            raise ValueError("Invalid Rippling listing")
        items = payload["items"]
        if not items:
            break
        for job in items:
            title = str(job.get("name") or "").strip()
            location = _irish_location(job.get("locations"))
            if not location:
                continue
            job_url = job.get("url")
            salary = extract_salary_from_context(location, title)
            if title and job_url and job_url not in seen_urls:
                seen_urls.add(job_url)
                opportunities.append(
                    {
                        "title": title,
                        "company": employer_name,
                        "location": location,
                        "employment_type": "See job post",
                        "salary_text": salary,
                        "description": f"{employer_name} position: {title}. Location: {location}.",
                        "url": job_url,
                        "source": employer_name,
                    }
                )
        total_pages = payload.get("totalPages")
        if isinstance(total_pages, int) and page + 1 >= total_pages:
            break

    else:
        raise ValueError("rippling listing exceeded the page limit")

    return opportunities
