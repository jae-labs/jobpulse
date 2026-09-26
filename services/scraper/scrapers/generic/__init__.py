"""Generic web crawler and ATS listing extractor."""

from scrapers.generic.crawler import EmployerSyncResult, ScrapeOutcome, sync_single_employer, sync_watchlist_employers
from scrapers.generic.discovery import discover_employer_careers
from scrapers.generic.listing import extract_jobs_from_listing

__all__ = [
    "discover_employer_careers",
    "extract_jobs_from_listing",
    "EmployerSyncResult",
    "ScrapeOutcome",
    "sync_single_employer",
    "sync_watchlist_employers",
]
