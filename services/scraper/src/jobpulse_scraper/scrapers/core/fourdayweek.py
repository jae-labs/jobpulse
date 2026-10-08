"""4dayweek.io aggregator feed (public JSON API).

A boardless aggregator: one API lists postings from many employers, so the company
comes from each record. Only the Irish slice is kept.
"""

from __future__ import annotations

import json

from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import IngestionIncompleteError, save_jobs_batch, update_source_status
from jobpulse_scraper.network.http_client import fetch_page
from jobpulse_scraper.scrapers.parsers.fourdayweek_core import _location_text as _location_text
from jobpulse_scraper.scrapers.parsers.fourdayweek_core import extract_fourdayweek_items as extract_fourdayweek_items

_LIST_URL = "https://4dayweek.io/api/v2/jobs?page={page}&limit=100"
_MAX_PAGES = 300


def sync_fourdayweek(max_pages: int = _MAX_PAGES) -> SyncReport:
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
        return SyncReport(0, detail, found=0)
    detail = f"Read {total_read} vacancies; persisted {total_saved} Irish opportunities."
    update_source_status("4dayweek.io", "Synced", detail, opportunities_found=total_saved)
    return SyncReport(total_saved, f"4dayweek.io: {total_saved} opportunities added or refreshed.", found=total_saved)
