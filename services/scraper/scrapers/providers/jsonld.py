"""Schema.org JobPosting JSON-LD adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text


def extract_jsonld_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
    seen_urls: set[str],
) -> list[dict[str, Any]]:
    """Extract JobPosting objects while sharing URL deduplication with the dispatcher."""
    opportunities: list[dict[str, Any]] = []
    scripts = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html_content, re.I | re.DOTALL
    )
    for script in scripts:
        try:
            data = json.loads(script)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data])
        for item in items:
            if not isinstance(item, dict) or item.get("@type") != "JobPosting":
                continue
            title = str(item.get("title", "")).strip()
            job_url = urljoin(listing_url, str(item.get("url") or listing_url))
            if not title or job_url in seen_urls:
                continue
            description = clean_text(str(item.get("description", "")))
            location = "Ireland"
            job_location = item.get("jobLocation")
            if isinstance(job_location, dict) and isinstance(job_location.get("address"), dict):
                address = job_location["address"]
                location = address.get("addressLocality") or address.get("addressRegion") or location
            salary_text = _salary_text(item, description, title)
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": item.get("employmentType", "See job post"),
                    "salary_text": salary_text,
                    "description": description or f"{employer_name} opportunity: {title}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )
    return opportunities


def _salary_text(item: dict[str, Any], description: str, title: str) -> str | None:
    salary = item.get("baseSalary")
    if isinstance(salary, dict):
        value = salary.get("value", {})
        if isinstance(value, dict) and "value" in value:
            return f"€{value['value']}"
        if "minValue" in salary and "maxValue" in salary:
            return f"€{salary['minValue']} – €{salary['maxValue']}"
    return extract_salary_from_context(description, title)
