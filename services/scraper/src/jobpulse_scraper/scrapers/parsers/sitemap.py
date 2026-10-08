"""Pure sitemap and schema.org microdata parsing."""

from __future__ import annotations

import html as html_lib
import re
import xml.etree.ElementTree as ET
from typing import Any

from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_text

_TITLE = re.compile(r'itemprop=["\']title["\'][^>]*>(.*?)</', re.I | re.DOTALL)
_DESCRIPTION = re.compile(r'itemprop=["\']description["\'][^>]*>(.*?)</(?:div|span|p|section)', re.I | re.DOTALL)
_LOCALITY = re.compile(r'itemprop=["\']addressLocality["\'][^>]*>(.*?)</', re.I | re.DOTALL)
_COUNTRY = re.compile(r'itemprop=["\']addressCountry["\'][^>]*>(.*?)</', re.I | re.DOTALL)


def _locs(xml_text: str) -> list[str]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as error:
        raise ValueError("Invalid sitemap XML") from error
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
