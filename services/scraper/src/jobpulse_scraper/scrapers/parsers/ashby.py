"""Pure ashby vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def parse_ashby_payload(employer_name: str, token: str, payload: object) -> list[dict[str, Any]]:
    """Parse a supplied public payload without network or database access."""
    ash_data: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(ash_data, dict) or not isinstance(ash_data.get("jobs"), list):
        raise ValueError("Invalid ashby listing")
    for j in ash_data.get("jobs", []):
        title = j.get("title", "").strip()
        loc = (j.get("location") or "").strip()
        sec_list = [s for s in j.get("secondaryLocations", []) if isinstance(s, dict)]

        # Multi-location check: check primary and secondary locations
        matched_loc = None
        if is_explicit_ireland_location(loc):
            matched_loc = loc
        else:
            for s in sec_list:
                s_loc = s.get("location", "")
                s_cntry = ""
                addr = s.get("address")
                if isinstance(addr, dict):
                    s_cntry = addr.get("addressCountry", "")
                if is_explicit_ireland_location(s_loc) or s_cntry.strip().lower() in {"ireland", "ie", "irl"}:
                    matched_loc = s_loc or s_cntry
                    break

        if not matched_loc:
            continue
        loc = matched_loc

        job_url = j.get("jobUrl") or j.get("applyUrl")
        desc_plain = j.get("descriptionPlain") or ""
        desc = desc_plain
        salary = extract_salary_from_context(desc_plain or desc, title)
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "external_id": str(j["id"]) if j.get("id") is not None else None,
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": j.get("employmentType") or "See job post",
                    "salary_text": salary,
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )
    return opportunities
