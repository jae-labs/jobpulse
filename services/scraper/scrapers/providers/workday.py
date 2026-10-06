"""Workday CXS careers-board listing adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen


def extract_workday_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Read bounded Workday CXS pages and normalize Irish vacancies."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    # 1. Workday CXS API
    wd = re.search(r"https://([^.]+)\.wd(\d+)\.myworkdayjobs\.com/(?:[a-zA-Z-]+/)?([^/?#]+)", listing_url)
    if wd:
        tenant, wdn, site = wd.group(1), wd.group(2), wd.group(3)
        api_url = f"https://{tenant}.wd{wdn}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
        page_limit = 20
        max_pages = 15  # safety cap: up to 300 postings scanned per employer

        def _fetch_workday_page(search_text: str, offset: int) -> tuple[list[dict], int]:
            api_req = Request(
                api_url,
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
                data=json.dumps(
                    {"limit": page_limit, "offset": offset, "searchText": search_text, "appliedFacets": {}}
                ).encode(),
            )
            with urlopen(api_req, timeout=10, context=get_ssl_context()) as r:
                d = json.loads(r.read().decode())
                return d.get("jobPostings", []), d.get("total", 0)

        try:
            postings: list[dict] = []
            first_page, total = _fetch_workday_page("Ireland", 0)
            if first_page:
                postings.extend(first_page)
                offset = page_limit
                while offset < total and offset < page_limit * max_pages:
                    more, _ = _fetch_workday_page("Ireland", offset)
                    if not more:
                        break
                    postings.extend(more)
                    offset += page_limit
            else:
                # Fallback: paginate the unfiltered list and filter client-side
                offset = 0
                while offset < page_limit * max_pages:
                    page, total2 = _fetch_workday_page("", offset)
                    if not page:
                        break
                    postings.extend(page)
                    offset += page_limit
                    if offset >= total2:
                        break

                postings = [
                    p
                    for p in postings
                    if "ireland" in p.get("locationsText", "").lower() or "dublin" in p.get("locationsText", "").lower()
                ]

                postings = [
                    p
                    for p in postings
                    if any(
                        term in p.get("locationsText", "").lower()
                        for term in [
                            "ireland",
                            "dublin",
                            "cork",
                            "kildare",
                            "leixlip",
                            "galway",
                            "limerick",
                            "waterford",
                            "grange castle",
                            "ringsend",
                            "ringaskiddy",
                            "shannon",
                        ]
                    )
                    or "location" in p.get("locationsText", "").lower()
                ]

            for j in postings:
                title = j.get("title", "").strip()
                loc = j.get("locationsText", "Ireland")
                url = f"https://{tenant}.wd{wdn}.myworkdayjobs.com/en-US/{site}" + j.get("externalPath", "")
                bullets = ", ".join(j.get("bulletFields", []))
                desc = f"{employer_name} position: {title}. {j.get('postedOn', '')} Requisition: {bullets}."
                salary = extract_salary_from_context(desc, title)
                if title and url not in seen_urls:
                    seen_urls.add(url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": "See job post",
                            "salary_text": salary,
                            "description": desc,
                            "url": url,
                            "source": employer_name,
                        }
                    )
        except Exception:
            pass

    return opportunities
