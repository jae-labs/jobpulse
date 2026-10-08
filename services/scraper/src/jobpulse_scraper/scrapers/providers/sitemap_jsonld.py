"""Generic career-site adapter: sitemap discovery + schema.org detail pages.

Several platforms freehire supports expose no listing API — Radancy/TalentBrew,
SAP SuccessFactors, Jobvite and a long tail of company career sites. They all
publish a sitemap and render each posting as server-side HTML carrying schema.org
JSON-LD or microdata. One reusable shape covers them, so a new employer is data,
not a new adapter.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.sitemap import _locs, _microdata_opportunity
from jobpulse_scraper.scrapers.providers.jsonld import extract_jsonld_opportunities
from jobpulse_scraper.scrapers.providers.location import is_explicit_ireland_location

SITEMAP_PATHS = ("/sitemap.xml", "/job_sitemap.xml", "/careers/sitemap_index.xml", "/sitemap_index.xml")
_JOB_URL = re.compile(r"/(?:job|jobs|careers|positions?|vacanc)/", re.I)
_MAX_DETAILS = 40
_MAX_CHILD_SITEMAPS = 5


def _fetch(url: str, timeout: int = 15, *, request_opener: RequestOpener | None = None) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with (request_opener or urlopen)(request, timeout=timeout, context=get_ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_sitemap_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
    sitemap_paths: tuple[str, ...] = SITEMAP_PATHS,
    *,
    request_opener: RequestOpener | None = None,
) -> list[dict[str, Any]]:
    """Read a career site via its sitemap and each posting's schema.org detail page."""
    host = urlsplit(listing_url).netloc
    if not host:
        return []

    locations: list[str] = []
    recognized = False
    for path in sitemap_paths:
        try:
            locations = _locs(_fetch(f"https://{host}{path}", request_opener=request_opener))
            recognized = True
        except HTTPError as error:
            if error.code != 404:
                raise
            continue
        if locations:
            break
    if not locations:
        if recognized:
            return []
        raise ValueError("Career sitemap unavailable or unrecognized")
    if any(location.endswith(".xml") for location in locations):
        children: list[str] = []
        for child in locations[:_MAX_CHILD_SITEMAPS]:
            children.extend(_locs(_fetch(child, request_opener=request_opener)))
        locations = children

    job_urls = [loc for loc in locations if _JOB_URL.search(loc) and loc.rstrip("/").rsplit("/", 1)[-1]]
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for job_url in job_urls[:_MAX_DETAILS]:
        page = _fetch(job_url, request_opener=request_opener)
        found = extract_jsonld_opportunities(employer_name, job_url, page, seen_urls)
        if not found:
            microdata = _microdata_opportunity(employer_name, job_url, page)
            found = [microdata] if microdata else []
        opportunities.extend(o for o in found if is_explicit_ireland_location(o.get("location", "")))
    return opportunities
