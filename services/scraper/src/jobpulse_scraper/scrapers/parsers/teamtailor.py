from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

from jobpulse_scraper.engine.location import IRELAND_LOCATION_KEYWORDS, is_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description, clean_text


def parse_teamtailor_rss(employer_name: str, content: bytes) -> list[dict[str, Any]]:
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    root = ET.fromstring(content)
    if root.tag != "rss":
        raise ValueError("Invalid Teamtailor RSS")
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
        cleaned_desc = clean_html_description(raw_desc)

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
            if any(kw in combined_text for kw in IRELAND_LOCATION_KEYWORDS) and is_ireland_location(cleaned_desc[:100]):
                is_ie = True
                matched_loc = "Dublin, Ireland" if "dublin" in combined_text else "Ireland"

        if not is_ie:
            continue

        seen_urls.add(job_url)
        short_desc = cleaned_desc
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
    return opportunities


def parse_teamtailor_json(employer_name: str, token: str, data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, list) and not (
        isinstance(data, dict) and isinstance(data.get("data", data.get("jobs")), list)
    ):
        raise ValueError("Invalid Teamtailor JSON")
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
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

        if not (any(kw in loc_text.lower() for kw in IRELAND_LOCATION_KEYWORDS) and is_ireland_location(loc_text)):
            continue

        seen_urls.add(job_url)
        body = clean_html_description(attrs.get("body", "") or attrs.get("pitch", ""))
        short_desc = body
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
    return opportunities
