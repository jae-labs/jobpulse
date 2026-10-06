"""JobStash aggregator feed (public JSON API).

A boardless aggregator: one API lists postings from many employers, so the company
comes from each record's ``organization.name``. Only the Irish slice is kept.
"""

from __future__ import annotations

import json
from typing import Any

from database.repository import IngestionIncompleteError, save_jobs_batch, update_source_status
from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import fetch_page
from scrapers.providers.location import is_explicit_ireland_location

_LIST_URL = "https://middleware.jobstash.xyz/jobs/list?page={page}&limit=200"
_MAX_PAGES = 200


def _location_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return ", ".join(str(part) for part in (value.get("city"), value.get("country")) if part)
    return ""


def extract_jobstash_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        title = str(item.get("title") or "").strip()
        location = _location_text(item.get("location"))
        if not title or not is_explicit_ireland_location(location):
            continue
        organization = item.get("organization") or {}
        company = str(organization.get("name") or "").strip() if isinstance(organization, dict) else ""
        url = str(item.get("url") or "").strip() or f"https://jobstash.xyz/jobs/{item.get('shortUUID', '')}/details"
        if url in seen:
            continue
        seen.add(url)
        description = clean_html_description(str(item.get("description") or item.get("summary") or ""))
        opportunities.append(
            {
                "title": title,
                "company": company or "Employer (via JobStash)",
                "location": location or "Ireland",
                "employment_type": str(item.get("commitment") or "See job post"),
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"{title} ({location}).",
                "url": url,
                "source": "JobStash",
            }
        )
    return opportunities


def sync_jobstash(max_pages: int = _MAX_PAGES) -> tuple[int, str]:
    """Scrape and ingest Irish vacancies from the JobStash feed."""
    total_saved = 0
    total_read = 0
    for page in range(1, max_pages + 1):
        try:
            payload = json.loads(fetch_page(_LIST_URL.format(page=page)))
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                raise ValueError("Invalid listing payload")
        except Exception as exc:
            update_source_status(
                "JobStash",
                "Failed",
                "Listing request failed; existing vacancies retained.",
                opportunities_found=total_saved,
            )
            raise IngestionIncompleteError(total_saved, 0, 0) from exc

        items = payload.get("data") or []
        if not items:
            break
        opportunities = extract_jobstash_items(items)
        total_read += len(items)
        if opportunities:
            try:
                total_saved += save_jobs_batch(opportunities, enrich=True)
            except IngestionIncompleteError as exc:
                raise IngestionIncompleteError(total_saved + exc.persisted, exc.failed, exc.vectors_pending) from exc
        if len(items) < 200 or (isinstance(payload.get("total"), int) and total_read >= payload["total"]):
            break

    else:
        update_source_status("JobStash", "Failed", "Listing exceeded the crawl limit; existing vacancies retained.")
        raise IngestionIncompleteError(total_saved, 0, 0)

    if total_read == 0:
        detail = "JobStash sync completed but found 0 active vacancies."
        update_source_status("JobStash", "Synced", detail, opportunities_found=0)
        return 0, detail
    detail = f"Read {total_read} vacancies; persisted {total_saved} Irish opportunities."
    update_source_status("JobStash", "Synced", detail, opportunities_found=total_saved)
    return total_saved, f"JobStash: {total_saved} opportunities added or refreshed."
