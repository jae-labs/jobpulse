"""Pure lidl vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.salary import extract_salary_from_context


def parse_lidl_payload(employer_name: str, identifier: str, payload: object) -> list[dict[str, Any]]:
    """Parse supplied source facts without transport or persistence."""
    data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(data, dict) or not isinstance(data.get("jobs"), list):
        raise ValueError("Invalid Lidl listing")
    for j in data.get("jobs", []):
        title = j.get("title", "").strip()
        loc_dict = j.get("location", {}) or {}
        loc = loc_dict.get("city") or loc_dict.get("name") or "Ireland"
        job_url = j.get("jobDetailUrl")
        contract = j.get("contractType") or "See job post"
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            desc = f"Lidl Ireland vacancy: {title}. Location: {loc}. Contract: {contract}."
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": contract,
                    "salary_text": extract_salary_from_context(desc, title),
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
