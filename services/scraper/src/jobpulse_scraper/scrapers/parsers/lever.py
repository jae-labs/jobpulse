"""Pure lever vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def parse_lever_payload(employer_name: str, token: str, payload: object) -> list[dict[str, Any]]:
    """Parse a supplied public payload without network or database access."""
    lev_data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(lev_data, list):
        raise ValueError("Invalid Lever listing")
    if isinstance(lev_data, list):
        for j in lev_data:
            title = j.get("text", "").strip()
            cats = j.get("categories", {}) or {}
            loc = cats.get("location") or ""
            if not is_explicit_ireland_location(loc):
                continue
            job_url = j.get("hostedUrl") or j.get("applyUrl")
            desc_plain = j.get("descriptionPlain") or ""
            desc = clean_html_description(
                "\n".join(
                    [desc_plain or j.get("description", "")]
                    + [f"{section.get('text', '')}\n{section.get('content', '')}" for section in j.get("lists", [])]
                    + [j.get("additionalPlain") or j.get("additional", "")]
                )
            )
            salary = extract_salary_from_context(desc_plain or desc, title)
            if title and job_url and job_url not in seen_urls:
                seen_urls.add(job_url)
                opportunities.append(
                    {
                        "external_id": str(j["id"]) if j.get("id") is not None else None,
                        "title": title,
                        "company": employer_name,
                        "location": loc,
                        "employment_type": cats.get("commitment") or "See job post",
                        "salary_text": salary,
                        "description": desc,
                        "url": job_url,
                        "source": employer_name,
                    }
                )
    return opportunities
