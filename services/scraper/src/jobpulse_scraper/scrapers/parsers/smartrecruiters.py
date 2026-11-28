"""Pure smartrecruiters vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def parse_smartrecruiters_payload(employer_name: str, sr_token: str, payload: object) -> list[dict[str, Any]]:
    """Parse one supplied postings page independently of pagination and transport."""
    sr_data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(sr_data, dict) or not isinstance(sr_data.get("content"), list):
        raise ValueError("Invalid smartrecruiters listing")
    for j in sr_data.get("content", []):
        title = j.get("name", "").strip()
        loc_obj = j.get("location", {}) or {}
        loc = ", ".join(str(loc_obj.get(key) or "") for key in ("city", "country") if loc_obj.get(key))
        if not is_explicit_ireland_location(loc):
            continue
        job_id = j.get("id")
        job_url = f"https://jobs.smartrecruiters.com/{sr_token}/{job_id}"
        desc = f"{employer_name} position: {title}. Location: {loc}."
        if title and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": j.get("typeOfEmployment", {}).get("label") or "See job post",
                    "salary_text": extract_salary_from_context(desc, title),
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
