"""The Housing Agency official careers scraper."""

from __future__ import annotations

from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import save_jobs_batch, update_source_status
from jobpulse_scraper.network.http_client import fetch_page
from jobpulse_scraper.scrapers.parsers.core_pages import extract_housing_agency_jobs as extract_housing_agency_jobs
from jobpulse_scraper.scrapers.parsers.core_pages import parse_housing_agency_page as parse_housing_agency_page

HOUSING_AGENCY_URL = "https://www.housingagency.ie/careers/"


def sync_housing_agency() -> SyncReport:
    """Scrape vacancies from The Housing Agency."""
    page = fetch_page(HOUSING_AGENCY_URL)
    opportunities = extract_housing_agency_jobs(page)
    jobs_to_save = parse_housing_agency_page(page)

    added = save_jobs_batch(jobs_to_save, enrich=True)

    detail_msg = f"Read {len(opportunities)} current opportunities; added {added} new opportunities."
    update_source_status("The Housing Agency", "Synced", detail_msg, opportunities_found=len(opportunities))
    return SyncReport(
        added,
        f"The Housing Agency: {len(opportunities)} opportunities read; {added} new opportunities.",
        found=len(opportunities),
    )
