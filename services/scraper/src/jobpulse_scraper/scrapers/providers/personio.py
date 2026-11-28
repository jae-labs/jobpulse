"""Personio career board and XML feed adapter."""

from __future__ import annotations

import re
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.personio import parse_personio_xml as parse_personio_xml


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
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Personio portals via their public XML feed."""
    opportunities: list[dict[str, Any]] = []

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
            with (request_opener or urlopen)(req, timeout=10, context=get_ssl_context()) as resp:
                xml_content = resp.read()
                if xml_content and (b"<work-positions" in xml_content or b"<position" in xml_content):
                    successful_tld = candidate_tld
                    break
        except HTTPError as error:
            if error.code != 404:
                raise
            continue

    if not xml_content:
        raise ValueError("Personio feed unavailable")

    return parse_personio_xml(employer_name, token, successful_tld, xml_content)
