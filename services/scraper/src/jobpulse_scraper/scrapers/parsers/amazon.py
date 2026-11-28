"""Pure amazon vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def parse_amazon_payload(employer_name: str, identifier: str, payload: object) -> list[dict[str, Any]]:
    """Parse supplied source facts without transport or persistence."""
    amz_data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(amz_data, dict) or not isinstance(amz_data.get("jobs"), list):
        raise ValueError("Invalid Amazon listing")
    for j in amz_data.get("jobs", []):
        title = j.get("title", "").strip()
        loc = j.get("city") or j.get("normalized_location") or "Dublin, Ireland"
        job_path = j.get("job_path") or ""
        job_url = f"https://www.amazon.jobs{job_path}" if job_path.startswith("/") else (j.get("url_next_step") or "")
        desc = clean_html_description(
            "\n\n".join(j.get(key) or "" for key in ("description", "basic_qualifications", "preferred_qualifications"))
        )
        if not desc:
            desc = f"{employer_name} position: {title}. Location: {loc}."
        salary = extract_salary_from_context(desc, title)
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": j.get("job_schedule_type") or "See job post",
                    "salary_text": salary,
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
