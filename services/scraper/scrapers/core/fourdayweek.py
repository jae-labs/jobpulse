"""4dayweek.io aggregator feed (public JSON API).

A boardless aggregator: one API lists postings from many employers, so the company
comes from each record. Only the Irish slice is kept.
"""

from __future__ import annotations

import json
from typing import Any

from database.repository import IngestionIncompleteError, save_jobs_batch, update_source_status
from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import fetch_page
from scrapers.providers.location import is_explicit_ireland_location

_LIST_URL = "https://4dayweek.io/api/v2/jobs?page={page}&limit=100"
_MAX_PAGES = 300


def _location_text(locations: Any) -> str:
    if not isinstance(locations, list):
        return ""
    parts: list[str] = []
    for loc in locations:
        if isinstance(loc, dict):
            parts.append(", ".join(str(loc.get(key) or "").strip() for key in ("city", "country") if loc.get(key)))
        elif isinstance(loc, str):
            parts.append(loc)
    return "; ".join(part for part in parts if part)


def extract_fourdayweek_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        title = str(item.get("title") or "").strip()
        location = _location_text(item.get("locations"))
        if not title or not is_explicit_ireland_location(location):
            continue
        url = str(item.get("url") or "").strip() or f"https://4dayweek.io/job/{item.get('slug', '')}"
        if url in seen:
            continue
        seen.add(url)
        description = clean_html_description(str(item.get("description") or ""))
        company = item.get("company")
        if isinstance(company, dict):
            company = company.get("name")
        company = company.strip() if isinstance(company, str) else ""
        opportunities.append(
            {
                "title": title,
                "company": company or "Employer (via 4dayweek)",
                "location": location or "Ireland",
                "employment_type": str(item.get("contract_type") or "See job post"),
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"{title} ({location}).",
                "url": url,
                "source": "4dayweek.io",
            }
        )
    return opportunities


def sync_fourdayweek(max_pages: int = _MAX_PAGES) -> tuple[int, str]:
    """Scrape and ingest Irish vacancies from the 4dayweek.io feed."""
    total_saved = 0
    total_read = 0
    for page in range(1, max_pages + 1):
        try:
            payload = json.loads(fetch_page(_LIST_URL.format(page=page)))
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                raise ValueError("Invalid listing payload")
        except Exception as exc:
            update_source_status(
                "4dayweek.io",
                "Failed",
                "Listing request failed; existing vacancies retained.",
                opportunities_found=total_saved,
            )
            raise IngestionIncompleteError(total_saved, 0, 0) from exc

        items = payload.get("data") or []
        if not items:
            break
        opportunities = extract_fourdayweek_items(items)
        total_read += len(items)
        if opportunities:
            try:
                total_saved += save_jobs_batch(opportunities, enrich=True)
            except IngestionIncompleteError as exc:
                raise IngestionIncompleteError(total_saved + exc.persisted, exc.failed, exc.vectors_pending) from exc
        if not payload.get("has_more"):
            break

    else:
        update_source_status("4dayweek.io", "Failed", "Listing exceeded the crawl limit; existing vacancies retained.")
        raise IngestionIncompleteError(total_saved, 0, 0)

    if total_read == 0:
        detail = "4dayweek.io sync completed but found 0 active vacancies."
        update_source_status("4dayweek.io", "Synced", detail, opportunities_found=0)
        return 0, detail
    detail = f"Read {total_read} vacancies; persisted {total_saved} Irish opportunities."
    update_source_status("4dayweek.io", "Synced", detail, opportunities_found=total_saved)
    return total_saved, f"4dayweek.io: {total_saved} opportunities added or refreshed."
