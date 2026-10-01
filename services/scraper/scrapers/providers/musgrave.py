"""Musgrave Alpine.js embedded JSON adapter."""

from __future__ import annotations

import json
import re
from typing import Any

from engine.salary import extract_salary_from_context


def extract_musgrave_opportunities(employer_name: str, html_content: str) -> list[dict[str, Any]]:
    """Extract vacancies embedded in Musgrave Alpine.js data."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    m_musg = re.search(r"jobs:\s*(\[\s*\{.*?\}\s*\])", html_content, re.DOTALL)
    if not m_musg:
        return opportunities

    try:
        m_jobs = json.loads(m_musg.group(1))
        for mj in m_jobs:
            title = mj.get("title", "").strip()
            loc = mj.get("location") or "Ireland"
            job_url = mj.get("permalink")
            closing = mj.get("formatted_closing_date") or mj.get("closing_date") or ""
            if title and job_url and job_url not in seen_urls:
                seen_urls.add(job_url)
                desc = f"{employer_name} position: {title}. Location: {loc}. Closing date: {closing}."
                opportunities.append(
                    {
                        "title": title,
                        "company": employer_name,
                        "location": loc,
                        "employment_type": "See job post",
                        "salary_text": extract_salary_from_context(desc, title),
                        "description": desc,
                        "url": job_url,
                        "source": employer_name,
                    }
                )
    except Exception:
        pass

    return opportunities
