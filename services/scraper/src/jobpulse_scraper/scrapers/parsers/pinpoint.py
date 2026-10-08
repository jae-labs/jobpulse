"""Pure pinpoint vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _location_text(location: Any) -> str:
    if not isinstance(location, dict):
        return ""
    return ", ".join(
        str(part) for part in (location.get("city"), location.get("province"), location.get("name")) if part
    )


def parse_pinpoint_payload(employer_name: str, identifier: str, supplied: object) -> list[dict[str, Any]]:
    """Parse supplied source facts without transport or persistence."""
    payload: Any = supplied
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    jobs = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(jobs, list):
        raise ValueError("Invalid pinpoint listing")
    for job in jobs:
        title = str(job.get("title") or "").strip()
        location = _location_text(job.get("location"))
        if not is_explicit_ireland_location(location):
            continue
        job_url = job.get("url")
        desc = clean_html_description(
            " ".join(
                str(job.get(key) or "") for key in ("description", "key_responsibilities", "skills_knowledge_expertise")
            )
        )
        employment = job.get("employment_type_text") or job.get("employment_type") or "See job post"
        salary = extract_salary_from_context(desc or location, title)
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": employment,
                    "salary_text": salary,
                    "description": desc or f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
