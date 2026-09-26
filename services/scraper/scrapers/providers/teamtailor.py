"""Teamtailor careers board and RSS/JSON feed adapter."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import IRELAND_LOCATION_KEYWORDS, is_ireland_location


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
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Teamtailor career boards."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    token = _extract_teamtailor_token(listing_url)
    if not token and html_content:
        token = _extract_teamtailor_token(html_content)
    if not token:
        return opportunities

    # 1. Try public RSS feed (primary structured feed for syndication)
    rss_url = f"https://{token}.teamtailor.com/jobs.rss"
    try:
        req = Request(rss_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml, application/xml"})
        with urlopen(req, timeout=10, context=get_ssl_context()) as resp:
            content = resp.read()
            if content and b"<rss" in content:
                root = ET.fromstring(content)
                for item in root.findall(".//item"):
                    title_el = item.find("title")
                    title = clean_text(title_el.text) if title_el is not None and title_el.text else ""
                    if not title:
                        continue

                    link_el = item.find("link")
                    job_url = link_el.text.strip() if link_el is not None and link_el.text else ""
                    if not job_url or job_url in seen_urls:
                        continue

                    # Extract locations from description, title, and teamtailor tags
                    desc_el = item.find("description")
                    raw_desc = desc_el.text if desc_el is not None and desc_el.text else ""
                    cleaned_desc = clean_text(raw_desc)

                    # Check for location in any element ending with 'location' or 'city'
                    loc_texts: list[str] = []
                    for child in item:
                        tag_lower = child.tag.lower()
                        if "location" in tag_lower or "city" in tag_lower or "country" in tag_lower:
                            if child.text:
                                loc_texts.append(child.text.strip())

                    category_els = item.findall("category")
                    for cat in category_els:
                        if cat.text:
                            loc_texts.append(cat.text.strip())

                    # Check if Ireland
                    is_ie = False
                    matched_loc = "Ireland"
                    for lt in loc_texts:
                        if any(kw in lt.lower() for kw in IRELAND_LOCATION_KEYWORDS) and is_ireland_location(lt):
                            is_ie = True
                            matched_loc = lt
                            break

                    if not is_ie:
                        # Check description and title for Irish locations if no location tags matched
                        combined_text = f"{title} {cleaned_desc[:200]}".lower()
                        if any(kw in combined_text for kw in IRELAND_LOCATION_KEYWORDS) and is_ireland_location(
                            cleaned_desc[:100]
                        ):
                            is_ie = True
                            matched_loc = "Dublin, Ireland" if "dublin" in combined_text else "Ireland"

                    if not is_ie:
                        continue

                    seen_urls.add(job_url)
                    short_desc = (
                        f"{employer_name} position: {title}. Location: {matched_loc}. {cleaned_desc[:300]}".strip()
                    )
                    salary = extract_salary_from_context(cleaned_desc or short_desc, title)

                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": matched_loc,
                            "employment_type": "See job post",
                            "salary_text": salary,
                            "description": short_desc,
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    if opportunities:
        return opportunities

    # 2. Fallback: try public jobs.json endpoint
    json_url = f"https://{token}.teamtailor.com/jobs.json"
    try:
        j_req = Request(json_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(j_req, timeout=10, context=get_ssl_context()) as j_resp:
            data = json.loads(j_resp.read().decode())
            job_items = data if isinstance(data, list) else data.get("data", []) or data.get("jobs", [])
            for j in job_items:
                attrs = j.get("attributes", j)
                title = clean_text(attrs.get("title", ""))
                if not title:
                    continue

                links_obj = j.get("links", {})
                job_url = links_obj.get("careersite-job-url") or attrs.get("url") or j.get("url")
                if not job_url:
                    job_id = j.get("id")
                    if job_id:
                        job_url = f"https://{token}.teamtailor.com/jobs/{job_id}"
                if not job_url or job_url in seen_urls:
                    continue

                locs = attrs.get("locations") or attrs.get("locations_names") or []
                if isinstance(locs, list):
                    loc_text = ", ".join(str(x) for x in locs)
                else:
                    loc_text = str(locs)

                if not (
                    any(kw in loc_text.lower() for kw in IRELAND_LOCATION_KEYWORDS) and is_ireland_location(loc_text)
                ):
                    continue

                seen_urls.add(job_url)
                body = clean_text(attrs.get("body", "") or attrs.get("pitch", ""))
                short_desc = f"{employer_name} position: {title}. Location: {loc_text}. {body[:300]}".strip()
                salary = extract_salary_from_context(body or short_desc, title)

                opportunities.append(
                    {
                        "title": title,
                        "company": employer_name,
                        "location": loc_text or "Ireland",
                        "employment_type": "See job post",
                        "salary_text": salary,
                        "description": short_desc,
                        "url": job_url,
                        "source": employer_name,
                    }
                )
    except Exception:
        pass

    return opportunities
