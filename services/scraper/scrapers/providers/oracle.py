"""Oracle Cloud HCM Candidate Experience REST API adapter."""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_ireland_location


def extract_oracle_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from Oracle Cloud HCM Career sites."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

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
        with urlopen(api_req, timeout=10, context=get_ssl_context()) as r:
            d = json.loads(r.read().decode())
            items = d.get("items", [{}])[0].get("requisitionList", [])
            for req_item in items:
                title = req_item.get("Title", "").strip()
                req_id = req_item.get("Id")
                loc = req_item.get("PrimaryLocation") or "Ireland"
                if not is_ireland_location(loc):
                    continue
                short_desc = req_item.get("ShortDescriptionStr") or ""
                preview_url = (
                    f"https://{host}/hcmUI/CandidateExperience/en/sites/{site_number}/requisitions/preview/{req_id}"
                )
                if title and preview_url not in seen_urls:
                    seen_urls.add(preview_url)
                    desc = f"{employer_name} position: {title}. Location: {loc}. {short_desc}".strip()
                    salary = extract_salary_from_context(desc, title)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": "See job post",
                            "salary_text": salary,
                            "description": desc,
                            "url": preview_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
