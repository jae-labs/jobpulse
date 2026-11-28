"""Pure bamboohr vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def parse_bamboohr_payload(employer_name: str, subdomain: str, data: object) -> list[dict[str, Any]]:
    """Parse supplied listing facts without transport or persistence."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(data, dict) or not isinstance(data.get("result"), list):
        raise ValueError("Invalid bamboohr listing")
    for j in data.get("result", []):
        title = j.get("jobOpeningName", "").strip()
        job_id = j.get("id")
        loc_dict = j.get("location", {}) or {}
        loc = ", ".join(str(loc_dict.get(key) or "") for key in ("city", "country") if loc_dict.get(key))
        if not is_explicit_ireland_location(loc):
            continue
        job_url = f"https://{subdomain}.bamboohr.com/careers/{job_id}"
        if title and job_url not in seen_urls:
            seen_urls.add(job_url)
            desc = f"{employer_name} position: {title}. Location: {loc}."
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": "See job post",
                    "salary_text": extract_salary_from_context(desc, title),
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
