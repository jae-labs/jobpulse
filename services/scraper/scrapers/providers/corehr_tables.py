"""CoreHR tables and TheHireLab ATS table adapters."""

from __future__ import annotations

import html
import re
import urllib.parse
from typing import Any
from urllib.parse import urljoin

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from engine.validators import is_valid_job_title
from scrapers.core.corehr import extract_maynooth_jobs


def extract_corehr_table_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
) -> list[dict[str, Any]]:
    """Extract university CoreHR recruit table vacancies."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if "corehr.com" not in listing_url:
        return opportunities

    core_jobs = extract_maynooth_jobs(html_content)
    for cj in core_jobs:
        job_url = cj.get("url")
        if not job_url and cj.get("reference"):
            base = listing_url.split("/erq_search_", 1)[0]
            job_url = (
                f"{base}/erq_jobspec_version_4.display_form?"
                f"p_company=1&p_internal_external=E&p_display_in_irish=N&"
                f"p_display_apply_ind=Y&p_recruitment_id={urllib.parse.quote(cj['reference'])}"
            )
        if job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            desc = f"{employer_name} position: {cj['title']}. Department: {cj.get('department', 'General')}. Reference: {cj.get('reference', 'N/A')}."
            salary = extract_salary_from_context(f"{desc} {cj.get('position_type', '')}", cj["title"])
            opportunities.append(
                {
                    "title": cj["title"],
                    "company": employer_name,
                    "location": "Dublin, Ireland",
                    "employment_type": cj.get("position_type") or "See job post",
                    "salary_text": salary,
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities


def extract_thehirelab_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
) -> list[dict[str, Any]]:
    """Extract TheHireLab onclick table row vacancies (e.g. DDLETB)."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if not ("thehirelab.com" in listing_url or "jobnavigation" in html_content.lower()):
        return opportunities

    hl_matches = re.findall(
        r"<tr[^>]*onclick=[\"\']jobNavigation\([\'\"]([^\'\"]+)[\'\"]\)[^>]*>(.*?)</tr>",
        html_content,
        re.I | re.DOTALL,
    )
    for rel_url, row_html in hl_matches:
        title_m = re.search(r"<span[^>]*id=[\"\']jobTitleLink[\"\'][^>]*>(.*?)</span>", row_html, re.I | re.DOTALL)
        row_title = clean_text(title_m.group(1)) if title_m else ""
        if not row_title:
            h_cand = re.search(r"<(?:strong|h[1-5])[^>]*>(.*?)</(?:strong|h[1-5])>", row_html, re.I | re.DOTALL)
            if h_cand:
                row_title = clean_text(h_cand.group(1))
        full_url = urljoin(listing_url, html.unescape(rel_url.strip()))
        if row_title and is_valid_job_title(row_title, full_url) and full_url not in seen_urls:
            seen_urls.add(full_url)
            desc = f"{employer_name} vacancy: {row_title}. See portal for details."
            salary = extract_salary_from_context(clean_text(row_html), row_title)
            opportunities.append(
                {
                    "title": row_title,
                    "company": employer_name,
                    "location": "Ireland",
                    "employment_type": "See job post",
                    "salary_text": salary,
                    "description": desc,
                    "url": full_url,
                    "source": employer_name,
                }
            )

    return opportunities
