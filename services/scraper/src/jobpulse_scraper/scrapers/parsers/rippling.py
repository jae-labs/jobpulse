"""Pure rippling vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


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


def parse_rippling_payload(employer_name: str, token: str, supplied: object) -> list[dict[str, Any]]:
    """Parse one supplied board page independently of pagination and transport."""
    payload: Any = supplied
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise ValueError("Invalid Rippling listing")
    items = payload["items"]
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

    return opportunities
