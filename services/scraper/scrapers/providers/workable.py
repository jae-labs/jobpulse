"""Workable public widget API adapter.

The paginated v3 accounts endpoint only returns the first page of roughly ten
postings and omits bodies, so most vacancies were silently missed. The v1 widget
endpoint returns the whole board and, with ``details=true``, each posting's
published HTML body.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_ACCOUNT = re.compile(r"apply\.workable\.com/(?:[a-zA-Z-]+/)?([a-zA-Z0-9_-]+)")


def _location_text(job: dict[str, Any]) -> str:
    """Prefer an explicitly Irish location, otherwise the posting's first place."""
    fallback = ""
    locations = job.get("locations")
    if isinstance(locations, list):
        for entry in locations:
            if not isinstance(entry, dict):
                continue
            text = ", ".join(
                str(entry.get(key) or "").strip()
                for key in ("city", "region", "country")
                if str(entry.get(key) or "").strip()
            )
            if not text:
                continue
            if is_explicit_ireland_location(text):
                return text
            fallback = fallback or text
    top_level = ", ".join(
        str(job.get(key) or "").strip() for key in ("city", "state", "country") if str(job.get(key) or "").strip()
    )
    return top_level or fallback


def extract_workable_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract every Irish vacancy, with its published body, from a Workable board."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    account_match = _ACCOUNT.search(listing_url)
    if not account_match or "api" in listing_url:
        return opportunities

    account = account_match.group(1)
    request = Request(
        f"https://apply.workable.com/api/v1/widget/accounts/{account}?details=true",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urlopen(request, timeout=20, context=get_ssl_context()) as response:
        data = json.loads(response.read().decode())
    jobs = data.get("jobs") if isinstance(data, dict) else data
    if not isinstance(jobs, list):
        raise ValueError("Invalid workable listing")

    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = str(job.get("title") or "").strip()
        if not title:
            continue
        location = _location_text(job)
        if not is_explicit_ireland_location(location):
            continue
        shortcode = str(job.get("shortcode") or "").strip()
        job_url = f"https://apply.workable.com/{account}/j/{shortcode}/"
        if job_url in seen_urls:
            continue
        seen_urls.add(job_url)
        description = clean_html_description(str(job.get("description") or ""))
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": str(job.get("employment_type") or "See job post"),
                "salary_text": extract_salary_from_context(description, title),
                "description": description,
                "url": job_url,
                "source": employer_name,
            }
        )

    return opportunities
