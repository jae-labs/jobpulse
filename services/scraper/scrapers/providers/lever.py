"""Lever postings API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location


def extract_lever_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Lever job boards."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    m_lev = re.search(r"jobs\.lever\.co/([a-zA-Z0-9_-]+)", listing_url)
    if not m_lev and html_content:
        m_lev = re.search(r"jobs\.lever\.co/([a-zA-Z0-9_-]+)", html_content)
    if not m_lev:
        return opportunities

    lev_token = m_lev.group(1)
    try:
        lev_url = f"https://api.lever.co/v0/postings/{lev_token}?mode=json"
        lev_req = Request(lev_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(lev_req, timeout=10, context=get_ssl_context()) as r:
            lev_data = json.loads(r.read().decode())
            if isinstance(lev_data, list):
                for j in lev_data:
                    title = j.get("text", "").strip()
                    cats = j.get("categories", {}) or {}
                    loc = cats.get("location") or ""
                    if not is_explicit_ireland_location(loc):
                        continue
                    job_url = j.get("hostedUrl") or j.get("applyUrl")
                    desc_plain = j.get("descriptionPlain") or ""
                    desc = f"{employer_name} position: {title}. Location: {loc}. {desc_plain[:300]}".strip()
                    salary = extract_salary_from_context(desc_plain or desc, title)
                    if title and job_url and job_url not in seen_urls:
                        seen_urls.add(job_url)
                        opportunities.append(
                            {
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
    except Exception:
        pass

    return opportunities
