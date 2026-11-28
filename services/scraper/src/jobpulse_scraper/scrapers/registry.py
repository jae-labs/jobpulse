"""Registry of specialized core scrapers and adapter mapping."""

from __future__ import annotations

from collections.abc import Callable

from jobpulse_scraper.config.loader import (
    INTEL_CAREERS_URL,
    JOBSIRELAND_URL,
    KILDARE_CAREERS_URL,
    MAYNOOTH_SEARCH_URL,
    PUBLICJOBS_URL,
)
from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.scrapers.core.allianz import sync_allianz
from jobpulse_scraper.scrapers.core.corehr import sync_dcu, sync_maynooth, sync_trinity, sync_tu_dublin, sync_ucd
from jobpulse_scraper.scrapers.core.fourdayweek import sync_fourdayweek
from jobpulse_scraper.scrapers.core.google import sync_google
from jobpulse_scraper.scrapers.core.housing_agency import sync_housing_agency
from jobpulse_scraper.scrapers.core.ida import sync_ida
from jobpulse_scraper.scrapers.core.intel import sync_intel
from jobpulse_scraper.scrapers.core.jobsireland import sync_jobsireland
from jobpulse_scraper.scrapers.core.jobstash import sync_jobstash
from jobpulse_scraper.scrapers.core.kerry import sync_kerry
from jobpulse_scraper.scrapers.core.kildare import sync_kildare
from jobpulse_scraper.scrapers.core.publicjobs import sync_publicjobs

# Registry of core specialized scrapers: (function, employer_name, default_url, method)
CORE_SCRAPERS: list[tuple[Callable[[], SyncReport], str, str, str]] = [
    (sync_jobsireland, "JobsIreland.ie", JOBSIRELAND_URL, "HTTP"),
    (sync_fourdayweek, "4dayweek.io", "https://4dayweek.io", "HTTP"),
    (sync_jobstash, "JobStash", "https://jobstash.xyz", "HTTP"),
    (
        sync_google,
        "Google",
        "https://www.google.com/about/careers/applications/jobs/results?q=Ireland",
        "HTTP",
    ),
    (sync_kildare, "Kildare County Council", KILDARE_CAREERS_URL, "HTTP"),
    (sync_publicjobs, "PublicJobs.ie", PUBLICJOBS_URL, "HTTP"),
    (sync_housing_agency, "The Housing Agency", "https://www.housingagency.ie/careers/", "HTTP"),
    (sync_maynooth, "Maynooth University", MAYNOOTH_SEARCH_URL, "Playwright"),
    (
        sync_tu_dublin,
        "Technological University Dublin",
        "https://my.corehr.com/pls/tudrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Playwright",
    ),
    (
        sync_trinity,
        "Trinity College Dublin",
        "https://my.corehr.com/pls/trrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Playwright",
    ),
    (
        sync_ucd,
        "University College Dublin",
        "https://my.corehr.com/pls/ucdrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Playwright",
    ),
    (
        sync_dcu,
        "Dublin City University",
        "https://my.corehr.com/pls/dcurecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Playwright",
    ),
    (sync_intel, "Intel Ireland", INTEL_CAREERS_URL, "Playwright"),
    (sync_kerry, "Kerry Group", "https://jobs.kerry.com/gb/en/search-results", "Playwright"),
    (sync_ida, "IDA Ireland", "https://www.idaireland.com/careers-at-ida-ireland/open-roles", "Playwright"),
    (sync_allianz, "Allianz Ireland", "https://careers.allianz.com/ie/en/search-results", "Playwright"),
]


def get_core_scrapers() -> list[tuple[Callable[[], SyncReport], str, str, str]]:
    """Return configured specialized core scrapers."""
    return CORE_SCRAPERS


def find_core_scraper_by_name(name: str) -> tuple[Callable[[], SyncReport], str, str, str] | None:
    """Find a specialized scraper by case-insensitive name."""
    name_l = name.strip().lower()
    for item in CORE_SCRAPERS:
        if item[1].lower() == name_l:
            return item
    return None
