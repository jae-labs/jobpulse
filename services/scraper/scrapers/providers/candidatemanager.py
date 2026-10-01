"""CandidateManager careers-board adapter."""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import urljoin

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from engine.validators import is_valid_job_title
from scrapers.providers.location import is_ireland_location


def extract_candidatemanager_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
) -> list[dict[str, Any]]:
    """Extract normalized opportunities from a CandidateManager result table."""
    if "candidatemanager.net" not in listing_url.lower():
        return []

    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html_content, re.I | re.DOTALL):
        link = re.search(
            r'<a[^>]+href=["\']([^"\']*pJobDetails\.aspx[^"\']*)["\'][^>]*>(.*?)</a>', row, re.I | re.DOTALL
        )
        if not link:
            continue
        job_url = urljoin(listing_url, html.unescape(link.group(1)))
        title = clean_text(link.group(2))
        cells = [clean_text(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", row, re.I | re.DOTALL)]
        employment_type = cells[1] if len(cells) > 1 else "See job post"
        location = cells[-1] if len(cells) > 2 else "Ireland"
        if (
            not title
            or job_url in seen_urls
            or not is_valid_job_title(title, job_url)
            or not is_ireland_location(location)
        ):
            continue
        seen_urls.add(job_url)
        description = f"{employer_name} position: {title}. Location: {location}."
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location or "Ireland",
                "employment_type": employment_type or "See job post",
                "salary_text": extract_salary_from_context(description, title),
                "description": description,
                "url": job_url,
                "source": employer_name,
            }
        )
    return opportunities
