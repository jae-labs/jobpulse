"""Workday CXS careers-board listing adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.workday import parse_workday_payload as parse_workday_payload


def extract_workday_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Read bounded Workday CXS pages and normalize Irish vacancies."""
    opportunities: list[dict[str, Any]] = []
    # 1. Workday CXS API
    wd = re.search(r"https://([^.]+)\.wd(\d+)\.myworkdayjobs\.com/(?:[a-zA-Z-]+/)?([^/?#]+)", listing_url)
    if wd:
        tenant, wdn, site = wd.group(1), wd.group(2), wd.group(3)
        api_url = f"https://{tenant}.wd{wdn}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
        page_limit = 20
        max_pages = 15  # safety cap: up to 300 postings scanned per employer

        def _fetch_workday_page(
            search_text: str, offset: int, *, request_opener: RequestOpener | None = None
        ) -> tuple[list[dict], int]:
            api_req = Request(
                api_url,
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
                data=json.dumps(
                    {"limit": page_limit, "offset": offset, "searchText": search_text, "appliedFacets": {}}
                ).encode(),
            )
            with (request_opener or urlopen)(api_req, timeout=10, context=get_ssl_context()) as r:
                d = json.loads(r.read().decode())
                if (
                    not isinstance(d, dict)
                    or not isinstance(d.get("jobPostings"), list)
                    or not isinstance(d.get("total"), int)
                    or d["total"] < 0
                    or any(not isinstance(item, dict) for item in d["jobPostings"])
                ):
                    raise ValueError("Invalid Workday listing")
                return d["jobPostings"], d["total"]

        try:
            postings: list[dict] = []
            first_page, total = _fetch_workday_page("Ireland", 0, request_opener=request_opener)
            if first_page:
                postings.extend(first_page)
                offset = page_limit
                while offset < total and offset < page_limit * max_pages:
                    more, _ = _fetch_workday_page("Ireland", offset, request_opener=request_opener)
                    if not more:
                        break
                    postings.extend(more)
                    offset += page_limit
            else:
                # Fallback: paginate the unfiltered list and filter client-side
                offset = 0
                while offset < page_limit * max_pages:
                    page, total2 = _fetch_workday_page("", offset, request_opener=request_opener)
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

            return parse_workday_payload(employer_name, listing_url, {"jobPostings": postings, "total": len(postings)})
        except Exception:
            raise

    return opportunities
