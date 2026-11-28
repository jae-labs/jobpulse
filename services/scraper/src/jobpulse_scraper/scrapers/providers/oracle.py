"""Oracle Cloud HCM Candidate Experience REST API adapter."""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.oracle import parse_oracle_payload as parse_oracle_payload


def extract_oracle_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Oracle Cloud HCM Career sites."""
    opportunities: list[dict[str, Any]] = []

    oc = re.search(r"https://([^/]+)/hcmUI/CandidateExperience/[^/]+/sites/([^/?#]+)", listing_url)
    oc_api = "recruitingCEJobRequisitions" in listing_url
    if not (oc or oc_api):
        return opportunities

    if oc_api:
        api_url = listing_url
        host = urllib.parse.urlparse(listing_url).netloc
        m_site = re.search(r"siteNumber=([a-zA-Z0-9_-]+)", listing_url)
        site_number = m_site.group(1) if m_site else "CX_1"
    else:
        assert oc is not None
        host, site_number = oc.group(1), oc.group(2)
        keyword = (
            "Ireland"
            if any(k in host.lower() or k in listing_url.lower() for k in ["dell", "jpmc", "oracle", "ireland"])
            else "Ireland"
        )
        kw_param = f",keyword={keyword}" if keyword else ""
        api_url = f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={site_number}{kw_param}"

    try:
        api_req = Request(api_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with (request_opener or urlopen)(api_req, timeout=10, context=get_ssl_context()) as r:
            d = json.loads(r.read().decode())
            return parse_oracle_payload(employer_name, host, site_number, d)
    except Exception:
        raise

    return opportunities
