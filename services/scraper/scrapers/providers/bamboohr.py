"""BambooHR careers list API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_ireland_location


def extract_bamboohr_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from BambooHR portals."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    bb = re.search(r"https://([a-zA-Z0-9-]+)\.bamboohr\.com", listing_url)
    if not bb:
        return opportunities

    subdomain = bb.group(1)
    try:
        bb_req = Request(
            f"https://{subdomain}.bamboohr.com/careers/list",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        with urlopen(bb_req, timeout=10, context=get_ssl_context()) as r:
            data = json.loads(r.read().decode())
            for j in data.get("result", []):
                title = j.get("jobOpeningName", "").strip()
                job_id = j.get("id")
                loc_dict = j.get("location", {}) or {}
                loc = loc_dict.get("city") or "Ireland"
                if not is_ireland_location(loc):
                    continue
                job_url = f"https://{subdomain}.bamboohr.com/careers/{job_id}"
                if title and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    desc = f"{employer_name} position: {title}. Location: {loc}."
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
