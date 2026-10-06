"""Generic career-site adapter: sitemap discovery + schema.org detail pages.

Several platforms freehire supports expose no listing API — Radancy/TalentBrew,
SAP SuccessFactors, Jobvite and a long tail of company career sites. They all
publish a sitemap and render each posting as server-side HTML carrying schema.org
JSON-LD or microdata. One reusable shape covers them, so a new employer is data,
not a new adapter.
"""

from __future__ import annotations

import html as html_lib
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlsplit
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.jsonld import extract_jsonld_opportunities
from scrapers.providers.location import is_explicit_ireland_location

SITEMAP_PATHS = ("/sitemap.xml", "/job_sitemap.xml", "/careers/sitemap_index.xml", "/sitemap_index.xml")
_JOB_URL = re.compile(r"/(?:job|jobs|careers|positions?|vacanc)/", re.I)
_MAX_DETAILS = 40
_MAX_CHILD_SITEMAPS = 5
_TITLE = re.compile(r'itemprop=["\']title["\'][^>]*>(.*?)</', re.I | re.DOTALL)
_DESCRIPTION = re.compile(r'itemprop=["\']description["\'][^>]*>(.*?)</(?:div|span|p|section)', re.I | re.DOTALL)
_LOCALITY = re.compile(r'itemprop=["\']addressLocality["\'][^>]*>(.*?)</', re.I | re.DOTALL)
_COUNTRY = re.compile(r'itemprop=["\']addressCountry["\'][^>]*>(.*?)</', re.I | re.DOTALL)


def _fetch(url: str, timeout: int = 15) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with urlopen(request, timeout=timeout, context=get_ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def _locs(xml_text: str) -> list[str]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    return [element.text.strip() for element in root.iter() if element.tag.endswith("loc") and element.text]


def _microdata_opportunity(employer_name: str, url: str, page: str) -> dict[str, Any] | None:
    """Best-effort schema.org microdata (SuccessFactors-style pages have no JSON-LD)."""
    title_match = _TITLE.search(page)
    if not title_match:
        return None
    title = clean_text(html_lib.unescape(title_match.group(1)))
    if not title:
        return None
    description_match = _DESCRIPTION.search(page)
    description = clean_text(html_lib.unescape(description_match.group(1))) if description_match else ""
    locality_match = _LOCALITY.search(page)
    locality = clean_text(locality_match.group(1)) if locality_match else ""
    country_match = _COUNTRY.search(page)
    country = clean_text(country_match.group(1)) if country_match else ""
    location = ", ".join(part for part in (locality, country) if part)
    return {
        "title": title,
        "company": employer_name,
        "location": location,
        "employment_type": "See job post",
        "salary_text": extract_salary_from_context(description, title),
        "description": description or f"{employer_name} position: {title}. Location: {location}.",
        "url": url,
        "source": employer_name,
    }


def extract_sitemap_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
    sitemap_paths: tuple[str, ...] = SITEMAP_PATHS,
) -> list[dict[str, Any]]:
    """Read a career site via its sitemap and each posting's schema.org detail page."""
    host = urlsplit(listing_url).netloc
    if not host:
        return []

    locations: list[str] = []
    for path in sitemap_paths:
        try:
            locations = _locs(_fetch(f"https://{host}{path}"))
        except Exception:
            locations = []
        if locations:
            break
    if not locations:
        return []
    if any(location.endswith(".xml") for location in locations):
        children: list[str] = []
        for child in locations[:_MAX_CHILD_SITEMAPS]:
            try:
                children.extend(_locs(_fetch(child)))
            except Exception:
                continue
        locations = children

    job_urls = [loc for loc in locations if _JOB_URL.search(loc) and loc.rstrip("/").rsplit("/", 1)[-1]]
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for job_url in job_urls[:_MAX_DETAILS]:
        try:
            page = _fetch(job_url)
        except Exception:
            continue
        found = extract_jsonld_opportunities(employer_name, job_url, page, seen_urls)
        if not found:
            microdata = _microdata_opportunity(employer_name, job_url, page)
            found = [microdata] if microdata else []
        opportunities.extend(o for o in found if is_explicit_ireland_location(o.get("location", "")))
    return opportunities
