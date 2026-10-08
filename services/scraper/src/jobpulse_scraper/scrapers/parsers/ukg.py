from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context

_IRELAND_COUNTRY_CODES = {"IRL", "IE"}


def _location_text(locations: Any) -> str:
    if not isinstance(locations, list):
        return ""
    parts = [
        str(loc.get("LocalizedDescription") or loc.get("LocalizedName") or "").strip()
        for loc in locations
        if isinstance(loc, dict)
    ]
    return "; ".join(part for part in parts if part)


def _is_irish(locations: Any, text: str) -> bool:
    if isinstance(locations, list):
        for loc in locations:
            if not isinstance(loc, dict):
                continue
            address = loc.get("Address") or {}
            country = address.get("Country") if isinstance(address, dict) else None
            code = str(country.get("Code") or "").upper() if isinstance(country, dict) else ""
            if code in _IRELAND_COUNTRY_CODES:
                return True
    return is_explicit_ireland_location(text)


def parse_ukg_payload(employer_name: str, board_url: str, payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("opportunities"), list):
        raise ValueError("Invalid UKG listing")
    jobs = payload["opportunities"]
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for job in jobs:
        title = str(job.get("Title") or "").strip()
        locations = job.get("Locations")
        location = _location_text(locations)
        if not _is_irish(locations, location):
            continue
        job_id = job.get("Id")
        job_url = f"{board_url}/OpportunityDetail?opportunityId={job_id}"
        employment = "Full-Time" if job.get("FullTime") else "See job post"
        salary = extract_salary_from_context(location, title)
        if title and job_id and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": employment,
                    "salary_text": salary,
                    "description": f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )
    return opportunities
