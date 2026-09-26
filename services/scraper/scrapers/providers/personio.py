"""Personio career board and XML feed adapter."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import IRELAND_LOCATION_KEYWORDS, is_ireland_location


def _extract_personio_token_and_tld(url_or_text: str) -> tuple[str, str] | None:
    """Extract Personio company token and TLD (.de or .com)."""
    match = re.search(r"https?://([a-zA-Z0-9_-]+)\.jobs\.personio\.(de|com)", url_or_text)
    if match:
        return match.group(1), match.group(2)
    match_inv = re.search(r"https?://jobs\.personio\.(de|com)/([a-zA-Z0-9_-]+)", url_or_text)
    if match_inv:
        return match_inv.group(2), match_inv.group(1)
    return None


def extract_personio_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Personio portals via their public XML feed."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    token_info = _extract_personio_token_and_tld(listing_url)
    if not token_info and html_content:
        token_info = _extract_personio_token_and_tld(html_content)
    if not token_info:
        return opportunities

    token, tld = token_info

    # Try preferred TLD first, fallback to the alternate TLD
    tlds_to_try = [tld, "com" if tld == "de" else "de"]

    xml_content = None
    successful_tld = tld

    for candidate_tld in tlds_to_try:
        xml_url = f"https://{token}.jobs.personio.{candidate_tld}/xml?language=en"
        try:
            req = Request(xml_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/xml, text/xml"})
            with urlopen(req, timeout=10, context=get_ssl_context()) as resp:
                xml_content = resp.read()
                if xml_content and b"<work-positions" in xml_content or b"<position" in xml_content:
                    successful_tld = candidate_tld
                    break
        except Exception:
            continue

    if not xml_content:
        return opportunities

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError:
        return opportunities

    for pos in root.findall(".//position"):
        title_el = pos.find("title")
        title = clean_text(title_el.text) if title_el is not None and title_el.text else ""
        if not title:
            continue

        job_id_el = pos.find("id")
        job_id = job_id_el.text.strip() if job_id_el is not None and job_id_el.text else ""
        if not job_id:
            continue

        # Location extraction from office and work-locations
        office_el = pos.find("office")
        office = office_el.text.strip() if office_el is not None and office_el.text else ""

        locations: list[str] = []
        if office:
            locations.append(office)

        is_ie = False
        matched_location_name = office or "Ireland"

        work_locations = pos.findall(".//work-location")
        for wl in work_locations:
            country_attr = (wl.attrib.get("country") or "").strip().upper()
            city_attr = (wl.attrib.get("city") or "").strip()
            wl_text = (wl.text or "").strip()

            combined = f"{city_attr} {wl_text} {country_attr}".strip()
            if combined:
                locations.append(combined)

            if country_attr in ("IE", "IRL") or "IRELAND" in country_attr:
                is_ie = True
                matched_location_name = city_attr or wl_text or "Ireland"
                break

        # Check keyword match in any collected locations
        if not is_ie:
            for loc_candidate in locations:
                low = loc_candidate.lower()
                if any(kw in low for kw in IRELAND_LOCATION_KEYWORDS) and is_ireland_location(loc_candidate):
                    is_ie = True
                    matched_location_name = loc_candidate
                    break

        if not is_ie:
            continue

        job_url = f"https://{token}.jobs.personio.{successful_tld}/job/{job_id}"
        if job_url in seen_urls:
            continue
        seen_urls.add(job_url)

        # Build description
        desc_parts = []
        for desc_el in pos.findall(".//job-description"):
            name_el = desc_el.find("name")
            val_el = desc_el.find("value")
            name_text = clean_text(name_el.text) if name_el is not None and name_el.text else ""
            val_text = clean_text(val_el.text) if val_el is not None and val_el.text else ""
            if name_text and val_text:
                desc_parts.append(f"{name_text}: {val_text}")
            elif val_text:
                desc_parts.append(val_text)

        full_desc = " ".join(desc_parts)
        short_desc = f"{employer_name} position: {title}. Location: {matched_location_name}. {full_desc[:300]}".strip()

        emp_type_el = pos.find("employmentType")
        emp_type = emp_type_el.text.strip().title() if emp_type_el is not None and emp_type_el.text else "See job post"

        salary = extract_salary_from_context(full_desc or short_desc, title)

        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": matched_location_name,
                "employment_type": emp_type,
                "salary_text": salary,
                "description": short_desc,
                "url": job_url,
                "source": employer_name,
            }
        )

    return opportunities
