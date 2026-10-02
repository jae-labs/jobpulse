"""WhatJobs Ireland publisher feed scraper."""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any
from urllib.parse import urlencode

from config.loader import WHATJOBS_API_URL
from database.repository import save_jobs_batch, update_source_status
from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_description_text
from engine.validators import is_valid_job_title
from network.http_client import fetch_page

DEFAULT_WHATJOBS_IE_PUBLISHER_ID = "7127"
WHATJOBS_TRACKED_ID_PATTERN = re.compile(r"pub_api__cpl__(\d+)")
WHATJOBS_RESELLER_MARK_PATTERN = re.compile(r"\s*#J-\d+-Ljbffr\s*$", re.IGNORECASE)


def parse_whatjobs_external_id(url: str) -> str:
    """Extract the native posting ID from a tracked WhatJobs redirect URL."""
    match = WHATJOBS_TRACKED_ID_PATTERN.search(url)
    return match.group(1) if match else ""


def extract_whatjobs_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract and normalize structured job records from WhatJobs API response."""
    opportunities: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for item in items:
        raw_title = item.get("title") or ""
        url = item.get("url") or ""
        title = raw_title.strip()

        if not title or not url or not is_valid_job_title(title, url):
            continue

        ext_id = parse_whatjobs_external_id(url)
        dedupe_key = ext_id or url
        if dedupe_key in seen_ids:
            continue
        seen_ids.add(dedupe_key)

        company = (item.get("company") or "").strip()
        if not company or company.lower() in ("confidential", "undisclosed"):
            company = "Employer (via WhatJobs)"

        raw_loc = (item.get("location") or "").strip()
        if not raw_loc:
            loc = "Ireland"
        elif "ireland" not in raw_loc.lower():
            loc = f"{raw_loc}, Ireland"
        else:
            loc = raw_loc

        snippet = item.get("snippet") or ""
        clean_snippet = WHATJOBS_RESELLER_MARK_PATTERN.sub("", snippet).strip()
        cleaned_desc = clean_description_text(clean_snippet, company, title)
        if not cleaned_desc:
            cleaned_desc = f"{company} position: {title} based in {loc}."

        salary_text = extract_salary_from_context(cleaned_desc, title)
        emp_type = item.get("job_type") or "Full-time"
        if not emp_type or emp_type == "Regular":
            emp_type = "Full-time"

        opportunities.append(
            {
                "title": title,
                "company": company,
                "location": loc,
                "employment_type": emp_type,
                "salary_text": salary_text,
                "description": cleaned_desc,
                "description_is_snippet": True,
                "url": url,
                "source": "WhatJobs Ireland",
            }
        )

    return opportunities


def fetch_whatjobs_page(
    page: int = 1,
    publisher_id: str = "",
    limit: int = 50,
    keyword: str = "",
) -> list[dict[str, Any]]:
    """Fetch one paginated window from WhatJobs JSON API."""
    pid = (
        publisher_id
        or os.environ.get("WHATJOBS_PUBLISHER_ID_IE")
        or os.environ.get("WHATJOBS_PUBLISHER_ID")
        or DEFAULT_WHATJOBS_IE_PUBLISHER_ID
    )
    params: dict[str, Any] = {
        "publisher": pid,
        "user_ip": "0.0.0.0",
        "limit": limit,
        "page": page,
    }
    if keyword:
        params["keyword"] = keyword

    query_str = urlencode(params)
    endpoint = f"{WHATJOBS_API_URL}?{query_str}"
    content = fetch_page(endpoint)

    try:
        data = json.loads(content)
        raw_items = data.get("data", [])
        return extract_whatjobs_items(raw_items)
    except Exception as exc:
        print(f"  [WHATJOBS] Failed to parse page {page}: {exc}")
        return []


def sync_whatjobs(
    max_pages: int = 40,
    publisher_id: str = "",
    limit: int = 50,
) -> tuple[int, str]:
    """Scrape and ingest active Irish vacancies from WhatJobs publisher feed."""
    seen_urls: set[str] = set()
    total_saved = 0
    total_read = 0

    for page in range(1, max_pages + 1):
        try:
            page_opps = fetch_whatjobs_page(page=page, publisher_id=publisher_id, limit=limit)
            if not page_opps:
                break

            new_opps = []
            for opp in page_opps:
                if opp["url"] not in seen_urls:
                    seen_urls.add(opp["url"])
                    new_opps.append(opp)

            total_read += len(page_opps)
            saved = 0
            if new_opps:
                saved = save_jobs_batch(new_opps, enrich=True)
                total_saved += saved

            print(
                f"  [WHATJOBS] Page {page}/{max_pages}: fetched {len(page_opps)}, "
                f"saved {saved} ({total_saved} total saved so far)"
            )

            time.sleep(0.2)
        except Exception as exc:
            print(f"  [WHATJOBS] Page {page} failed: {exc}")
            if page == 1:
                detail_msg = f"Failed to connect to WhatJobs API: {exc}"
                update_source_status("WhatJobs Ireland", "Error", detail_msg, opportunities_found=0)
                return 0, detail_msg
            break

    if total_read == 0:
        detail_msg = "WhatJobs Ireland sync completed but found 0 active vacancies."
        update_source_status("WhatJobs Ireland", "Synced", detail_msg, opportunities_found=0)
        return 0, detail_msg

    detail_msg = f"Read {total_read} vacancies across Ireland; persisted {total_saved} opportunities."
    update_source_status("WhatJobs Ireland", "Synced", detail_msg, opportunities_found=total_saved)
    return total_saved, f"WhatJobs Ireland: {total_saved} opportunities added or refreshed."
