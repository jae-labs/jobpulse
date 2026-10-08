"""Kildare County Council careers scraper."""

from __future__ import annotations

from jobpulse_scraper.config.loader import KILDARE_CAREERS_URL
from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import save_jobs_batch, update_source_status
from jobpulse_scraper.network.http_client import fetch_page
from jobpulse_scraper.scrapers.parsers.core_pages import parse_kildare_page as parse_kildare_page


def sync_kildare() -> SyncReport:
    """Scrape Kildare County Council candidate information booklet PDFs."""
    page = fetch_page(KILDARE_CAREERS_URL)
    jobs_to_save = parse_kildare_page(page)
    read = len(jobs_to_save)

    added = save_jobs_batch(jobs_to_save, enrich=True)

    detail = f"Read {read} current opportunity booklets; added {added} new opportunities."
    update_source_status("Kildare County Council", "Synced", detail, opportunities_found=read)
    return SyncReport(
        added, f"Kildare County Council: {read} opportunity booklets read; {added} new opportunities.", found=read
    )
