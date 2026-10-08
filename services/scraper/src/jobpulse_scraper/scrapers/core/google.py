"""Google careers feed (server-rendered embedded JSON).

A boardless single-company source: the paged results page inlines its whole job
payload in an ``AF_initDataCallback`` ``ds:1`` script block, so one paged list crawl
assembles every posting with no per-posting detail request. The public careers JSON
API is gone, so the list pages are read directly. Only Irish postings are kept.
"""

from __future__ import annotations

import re

from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import IngestionIncompleteError, save_jobs_batch, update_source_status
from jobpulse_scraper.network.http_client import fetch_page
from jobpulse_scraper.scrapers.parsers.google_core import _ds1_payload as _ds1_payload
from jobpulse_scraper.scrapers.parsers.google_core import _html_field as _html_field
from jobpulse_scraper.scrapers.parsers.google_core import _locations as _locations
from jobpulse_scraper.scrapers.parsers.google_core import _string as _string
from jobpulse_scraper.scrapers.parsers.google_core import extract_google_items as extract_google_items

# ``q=Ireland`` filters the catalogue server-side, so only Irish postings are paged.
_LIST_URL = "https://www.google.com/about/careers/applications/jobs/results?q=Ireland&page={page}"
_JOB_URL = "https://www.google.com/about/careers/applications/jobs/results/{job_id}"
_MAX_PAGES = 40

_SCRIPT = re.compile(r"<script[^>]*>(.*?)</script>", re.S)
_DS1_DATA = re.compile(r"data:(\[.*?\]), sideChannel", re.S)


def sync_google(max_pages: int = _MAX_PAGES) -> SyncReport:
    """Scrape and ingest Irish vacancies from Google's own careers catalogue."""
    total_saved = 0
    total_read = 0
    for page in range(1, max_pages + 1):
        try:
            payload = _ds1_payload(fetch_page(_LIST_URL.format(page=page)))
            if not payload or not isinstance(payload[0], list):
                raise ValueError("Missing Google listing payload")
        except Exception as exc:
            update_source_status(
                "Google",
                "Failed",
                "Listing request failed; existing vacancies retained.",
                opportunities_found=total_saved,
            )
            raise IngestionIncompleteError(total_saved, 0, 0) from exc

        if not payload:
            break
        records = payload[0] if payload and isinstance(payload[0], list) else []
        total = payload[2] if len(payload) > 2 and isinstance(payload[2], int) else 0
        if not records:
            break
        opportunities = extract_google_items(records)
        total_read += len(records)
        if opportunities:
            try:
                total_saved += save_jobs_batch(opportunities, enrich=True)
            except IngestionIncompleteError as exc:
                raise IngestionIncompleteError(total_saved + exc.persisted, exc.failed, exc.vectors_pending) from exc
        if total and total_read >= total:
            break

    else:
        update_source_status("Google", "Failed", "Listing exceeded the crawl limit; existing vacancies retained.")
        raise IngestionIncompleteError(total_saved, 0, 0)

    if total_read == 0:
        detail = "Google sync completed but found 0 active vacancies."
        update_source_status("Google", "Synced", detail, opportunities_found=0)
        return SyncReport(0, detail, found=0)
    detail = f"Read {total_read} vacancies; persisted {total_saved} Irish opportunities."
    update_source_status("Google", "Synced", detail, opportunities_found=total_saved)
    return SyncReport(total_saved, f"Google: {total_saved} opportunities added or refreshed.", found=total_saved)
