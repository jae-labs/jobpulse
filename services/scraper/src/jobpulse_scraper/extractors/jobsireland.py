"""Read and reuse positively parsed published JobsIreland bodies."""

from __future__ import annotations

from urllib.parse import urlparse

from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.network.detail_cache import cached_body, remember_body
from jobpulse_scraper.network.experience import measured_stage
from jobpulse_scraper.network.http_client import fetch_page
from jobpulse_scraper.scrapers.parsers.jobsireland_detail import parse_jobsireland_detail


def extract_jobsireland_job_spec(url: str) -> dict[str, str]:
    parts = urlparse(url)
    if parts.hostname != "jobsireland.ie" or parts.username or parts.password:
        return {}
    try:
        cached = cached_body(url)
        if cached:
            return {"description": cached, "description_origin": "published_detail"}
        page = fetch_page(url)
        with measured_stage("detail_parse"):
            spec = parse_jobsireland_detail(url, page)
        if has_description_body(spec.get("description"), minimum_chars=1):
            remember_body(url, spec["description"])
        return spec
    except Exception:
        return {}
