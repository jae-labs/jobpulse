"""Lidl Ireland REST API adapter."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen


def extract_lidl_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from Lidl Ireland careers API."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if not ("jobs.lidl.ie" in listing_url or "careers.lidl.ie" in listing_url):
        return opportunities

    try:
        lidl_req = Request(
            "https://jobs.lidl.ie/api/v1/search",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        with urlopen(lidl_req, timeout=10, context=get_ssl_context()) as r:
            data = json.loads(r.read().decode())
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
    except Exception:
        pass

    return opportunities
