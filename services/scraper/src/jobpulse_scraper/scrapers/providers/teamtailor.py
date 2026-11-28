"""Teamtailor careers board and RSS/JSON feed adapter."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.teamtailor import parse_teamtailor_json as parse_teamtailor_json
from jobpulse_scraper.scrapers.parsers.teamtailor import parse_teamtailor_rss as parse_teamtailor_rss


def _extract_teamtailor_token(url_or_text: str) -> str | None:
    """Extract Teamtailor company token from domain or embed."""
    match = re.search(r"https?://([a-zA-Z0-9_-]+)\.teamtailor\.com", url_or_text)
    if match:
        return match.group(1)
    match_embed = re.search(r"([a-zA-Z0-9_-]+)\.teamtailor\.com", url_or_text)
    if match_embed:
        return match_embed.group(1)
    return None


def extract_teamtailor_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Teamtailor career boards."""
    opportunities: list[dict[str, Any]] = []

    token = _extract_teamtailor_token(listing_url)
    if not token and html_content:
        token = _extract_teamtailor_token(html_content)
    if not token:
        return opportunities

    # 1. Try public RSS feed (primary structured feed for syndication)
    rss_url = f"https://{token}.teamtailor.com/jobs.rss"
    try:
        req = Request(rss_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml, application/xml"})
        with (request_opener or urlopen)(req, timeout=10, context=get_ssl_context()) as resp:
            content = resp.read()
            if content and b"<rss" in content:
                return parse_teamtailor_rss(employer_name, content)
    except HTTPError as error:
        if error.code != 404:
            raise
    except (ValueError, ET.ParseError):
        pass

    if opportunities:
        return opportunities

    # 2. Fallback: try public jobs.json endpoint
    json_url = f"https://{token}.teamtailor.com/jobs.json"
    try:
        j_req = Request(json_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with (request_opener or urlopen)(j_req, timeout=10, context=get_ssl_context()) as j_resp:
            data = json.loads(j_resp.read().decode())
            return parse_teamtailor_json(employer_name, token, data)
    except Exception:
        raise

    return opportunities
