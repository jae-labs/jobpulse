"""Pure jobtrain vacancy parsing from supplied public source facts."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_text
from jobpulse_scraper.engine.validators import is_valid_job_title


def parse_jobtrain_html(employer_name: str, jt_url: str, jt_html: str) -> list[dict[str, Any]]:
    """Parse supplied job-card HTML without network access."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    jt_links = re.findall(
        r"<a\s+[^>]*href=[\"\']([^\'\"]*JobDetail[^\'\"]*)[\"\'][^>]*>(.*?)</a>",
        jt_html,
        re.I | re.DOTALL,
    )
    for h, t in jt_links:
        ct = clean_text(t)
        if not ct or any(skip in ct.lower() for skip in ["more..", "apply", "view"]):
            continue
        full_url = urljoin(jt_url, h.strip())
        if is_valid_job_title(ct, full_url) and full_url not in seen_urls:
            seen_urls.add(full_url)
            desc = f"{employer_name} vacancy: {ct}. Follow portal link for requirements and closing date."
            opportunities.append(
                {
                    "title": ct,
                    "company": employer_name,
                    "location": "Dublin, Ireland",
                    "employment_type": "See job post",
                    "salary_text": extract_salary_from_context(desc, ct),
                    "description": desc,
                    "url": full_url,
                    "source": employer_name,
                }
            )

    return opportunities
