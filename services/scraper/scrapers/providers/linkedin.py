"""LinkedIn guest job search card parser."""

from __future__ import annotations

import re
from typing import Any

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from engine.validators import is_valid_job_title


def extract_linkedin_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
) -> list[dict[str, Any]]:
    """Extract vacancies from public LinkedIn job cards."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if "linkedin.com" not in listing_url:
        return opportunities

    card_matches = re.findall(
        r'<div class="base-card[^\"]*">.*?<h3 class="base-search-card__title">(.*?)</h3>.*?(?:<h4 class="base-search-card__subtitle">(.*?)</h4>)?.*?<span class="job-search-card__location">(.*?)</span>.*?<a class="base-card__full-link[^\"]*"\s+href="([^\"]+)"',
        html_content,
        re.DOTALL,
    )
    for t_raw, comp_raw, loc_raw, link_raw in card_matches:
        title = clean_text(t_raw)
        comp = clean_text(comp_raw or "")
        loc = clean_text(loc_raw or "") or "Dublin, Ireland"
        job_url = link_raw.split("?")[0]
        if comp and "linkedin" not in comp.lower() and employer_name == "LinkedIn Ireland":
            continue
        if is_valid_job_title(title, job_url) and job_url not in seen_urls:
            seen_urls.add(job_url)
            desc = f"{employer_name} position: {title}. Location: {loc}."
            salary = extract_salary_from_context(desc, title)
            opportunities.append(
                {
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
