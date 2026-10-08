"""Pure breezy vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def _location_text(location: Any) -> str:
    if isinstance(location, dict):
        country = location.get("country")
        country_name = country.get("name") if isinstance(country, dict) else country
        return ", ".join(str(part) for part in (location.get("city"), country_name) if part)
    return location if isinstance(location, str) else ""


def parse_breezy_payload(employer_name: str, identifier: str, payload: object) -> list[dict[str, Any]]:
    """Parse supplied source facts without transport or persistence."""
    data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(data, list):
        raise ValueError("Invalid breezy listing")
    for job in data:
        title = str(job.get("name") or "").strip()
        location = _location_text(job.get("location"))
        if not is_explicit_ireland_location(location):
            continue
        job_url = job.get("url")
        job_type = job.get("type")
        employment = job_type.get("name") if isinstance(job_type, dict) else None
        salary = str(job.get("salary") or "") or extract_salary_from_context(location, title)
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": employment or "See job post",
                    "salary_text": salary,
                    "description": f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
