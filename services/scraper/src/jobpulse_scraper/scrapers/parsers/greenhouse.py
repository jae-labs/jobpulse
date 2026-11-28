"""Pure greenhouse vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def parse_greenhouse_payload(employer_name: str, token: str, payload: object) -> list[dict[str, Any]]:
    """Parse a supplied public payload without network or database access."""
    gh_token = token
    gh_data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(gh_data, dict) or not isinstance(gh_data.get("jobs"), list):
        raise ValueError("Invalid greenhouse listing")
    for j in gh_data.get("jobs", []):
        title = j.get("title", "").strip()
        loc_info = j.get("location", {})
        loc = (loc_info.get("name") if isinstance(loc_info, dict) else str(loc_info)) or ""
        if not is_explicit_ireland_location(loc):
            continue
        job_url = j.get("absolute_url") or f"https://job-boards.greenhouse.io/{gh_token}/jobs/{j.get('id')}"
        content = clean_html_description(j.get("content", ""))
        desc = content
        salary = extract_salary_from_context(content or desc, title)
        if title and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "external_id": str(j["id"]) if j.get("id") is not None else None,
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": "See job post",
                    "salary_text": salary,
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )
    return opportunities
