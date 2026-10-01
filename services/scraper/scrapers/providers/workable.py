"""Workable public accounts API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location


def extract_workable_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from Workable accounts."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    wk = re.search(r"apply\.workable\.com/(?:[a-zA-Z-]+/)?([a-zA-Z0-9_-]+)", listing_url)
    if not wk or "api" in listing_url:
        return opportunities

    account = wk.group(1)
    try:
        wk_req = Request(
            f"https://apply.workable.com/api/v3/accounts/{account}/jobs",
            data=b"{}",
            headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"},
        )
        with urlopen(wk_req, timeout=10, context=get_ssl_context()) as r:
            data = json.loads(r.read().decode())
            for j in data.get("results", []):
                title = j.get("title", "").strip()
                shortcode = j.get("shortcode")
                loc_obj = j.get("location", {}) or {}
                loc = loc_obj.get("display") or loc_obj.get("city") or loc_obj.get("country") or ""
                if not is_explicit_ireland_location(loc):
                    continue
                job_url = f"https://apply.workable.com/{account}/j/{shortcode}/"
                if title and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    desc = f"{employer_name} position: {title}. Location: {loc}."
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": j.get("type", "See job post"),
                            "salary_text": extract_salary_from_context(desc, title),
                            "description": desc,
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
