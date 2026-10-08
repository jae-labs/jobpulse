"""Pure recruitee vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_description_text
from jobpulse_scraper.engine.validators import is_valid_job_title


def parse_recruitee_payload(employer_name: str, company_slug: str, data: object) -> list[dict[str, Any]]:
    """Parse supplied public offer facts without transport or persistence."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if not isinstance(data, dict) or not isinstance(data.get("offers"), list):
        raise ValueError("Invalid recruitee listing")
    offers = data.get("offers", [])

    for item in offers:
        title = (item.get("title") or "").strip()
        job_url = item.get("careers_url") or item.get("careers_apply_url") or ""
        if not title or not job_url or not is_valid_job_title(title, job_url):
            continue

        if job_url in seen_urls:
            continue

        country_code = (item.get("country_code") or "").upper()
        loc = (item.get("location") or item.get("city") or "").strip()

        if country_code and country_code != "IE":
            continue
        if not country_code and not is_explicit_ireland_location(loc) and "ireland" not in employer_name.lower():
            continue

        seen_urls.add(job_url)

        if not loc:
            loc = "Ireland"
        elif "ireland" not in loc.lower():
            loc = f"{loc}, Ireland"

        sal_data = item.get("salary") or {}
        salary_text = ""
        s_min = sal_data.get("min")
        s_max = sal_data.get("max")
        s_curr = sal_data.get("currency") or "EUR"
        s_period = sal_data.get("period") or "annual"
        if s_min or s_max:
            if s_min and s_max:
                salary_text = f"{s_curr} {s_min} - {s_max} {s_period}"
            elif s_min:
                salary_text = f"From {s_curr} {s_min} {s_period}"
            elif s_max:
                salary_text = f"Up to {s_curr} {s_max} {s_period}"

        raw_desc = item.get("description") or ""
        raw_reqs = item.get("requirements") or ""
        combined_desc = f"{raw_desc}\n\n{raw_reqs}".strip()
        cleaned_desc = clean_description_text(combined_desc, employer_name, title)
        if not cleaned_desc:
            cleaned_desc = f"{employer_name} role: {title} based in {loc}."

        if not salary_text:
            salary_text = extract_salary_from_context(cleaned_desc, title)

        emp_type = item.get("employment_type_code") or "Full-time"
        emp_type = emp_type.replace("_", " ").title()

        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": loc,
                "employment_type": emp_type,
                "salary_text": salary_text,
                "description": cleaned_desc,
                "url": job_url,
                "source": employer_name,
            }
        )

    return opportunities
