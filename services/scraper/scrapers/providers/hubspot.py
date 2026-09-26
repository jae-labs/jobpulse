"""HubSpot Careers GraphQL API adapter."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_ireland_location


def extract_hubspot_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from HubSpot Careers GraphQL API."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if "hubspot.com" not in listing_url:
        return opportunities

    try:
        hb_query = """query Jobs {
          jobs {
            id
            title
            department { name }
            office { id location }
            location { name }
          }
        }"""
        hb_payload = json.dumps({"operationName": "Jobs", "query": hb_query, "variables": {}}).encode("utf-8")
        hb_req = Request(
            "https://wtcfns.hubspot.com/careers/graphql",
            data=hb_payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Origin": "https://www.hubspot.com",
                "Referer": "https://www.hubspot.com/",
            },
        )
        with urlopen(hb_req, timeout=10, context=get_ssl_context()) as r:
            hb_data = json.loads(r.read().decode())
            for j in hb_data.get("data", {}).get("jobs", []):
                title = j.get("title", "").strip()
                loc = (
                    (j.get("office") or {}).get("location")
                    or (j.get("location") or {}).get("name")
                    or "Dublin, Ireland"
                )
                if not is_ireland_location(loc) or not any(k in loc.lower() for k in ["dublin", "ireland"]):
                    continue
                job_id = j.get("id")
                job_url = f"https://www.hubspot.com/careers/jobs/{job_id}"
                dept = (j.get("department") or {}).get("name", "")
                desc = f"HubSpot position: {title}. Location: {loc}. Department: {dept}."
                if title and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": "See job post",
                            "salary_text": None,
                            "description": desc,
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
