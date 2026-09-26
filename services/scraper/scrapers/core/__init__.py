"""Specialized core scrapers package."""

from scrapers.core.allianz import sync_allianz
from scrapers.core.corehr import (
    extract_maynooth_jobs,
    sync_corehr,
    sync_maynooth,
    sync_trinity,
    sync_tu_dublin,
)
from scrapers.core.housing_agency import extract_housing_agency_jobs, sync_housing_agency
from scrapers.core.ida import sync_ida
from scrapers.core.intel import (
    extract_intel_ireland_jobs,
    intel_ireland_facets,
    sync_intel,
)
from scrapers.core.kerry import extract_kerry_job_details, sync_kerry
from scrapers.core.kildare import sync_kildare
from scrapers.core.publicjobs import extract_publicjobs_detail, sync_publicjobs

__all__ = [
    "sync_kildare",
    "sync_publicjobs",
    "extract_publicjobs_detail",
    "sync_housing_agency",
    "extract_housing_agency_jobs",
    "sync_corehr",
    "extract_maynooth_jobs",
    "sync_maynooth",
    "sync_tu_dublin",
    "sync_trinity",
    "sync_intel",
    "extract_intel_ireland_jobs",
    "intel_ireland_facets",
    "sync_kerry",
    "extract_kerry_job_details",
    "sync_ida",
    "sync_allianz",
]
