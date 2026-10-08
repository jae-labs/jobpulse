from __future__ import annotations

import html
from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description

_BASE_URL = "https://jobs.dayforcehcm.com"


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


def parse_dayforce_payload(
    employer_name: str, tenant: str, site: str, culture: str, payload: Any
) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("jobPostings"), list):
        raise ValueError("Invalid Dayforce listing")
    postings = payload["jobPostings"]
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
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
    return opportunities
