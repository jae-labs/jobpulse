"""The Housing Agency official careers scraper."""

from __future__ import annotations

import re

from database.repository import delete_jobs, save_job, update_source_status
from engine.text_cleaner import clean_text
from network.http_client import fetch_page

HOUSING_AGENCY_URL = "https://www.housingagency.ie/careers/"


def extract_housing_agency_jobs(page: str) -> list[tuple[str, str]]:
    """Parse Housing Agency careers HTML for job vacancy URLs and titles."""
    anchors = re.findall(
        r'<a [^>]*href="(https://www\.housingagency\.ie/careers/[^"]+)"[^>]*>(.*?)</a>',
        page,
        flags=re.IGNORECASE | re.DOTALL,
    )
    jobs = []
    for url, content in anchors:
        heading = re.search(r"<h3[^>]*>(.*?)</h3>", content, flags=re.IGNORECASE | re.DOTALL)
        title = clean_text(heading.group(1)) if heading else ""
        if url.rstrip("/") != "https://www.housingagency.ie/careers" and title:
            jobs.append((title, url))
    return list(dict.fromkeys(jobs))


def sync_housing_agency() -> tuple[int, str]:
    """Scrape vacancies from The Housing Agency."""
    page = fetch_page(HOUSING_AGENCY_URL)
    opportunities = extract_housing_agency_jobs(page)
    added = 0

    delete_jobs(company="The Housing Agency", url_like="%#faqs")

    for title, url in opportunities:
        if save_job(
            {
                "title": title,
                "company": "The Housing Agency",
                "location": "Dublin - see job post",
                "employment_type": "See job post",
                "description": f"The Housing Agency vacancy: {title}. Check the official posting for salary, contract terms, responsibilities, and closing date.",
                "url": url,
                "source": "The Housing Agency",
            }
        ):
            added += 1

    detail_msg = f"Read {len(opportunities)} current opportunities; added {added} new opportunities."
    update_source_status("The Housing Agency", "Synced", detail_msg, opportunities_found=len(opportunities))
    return added, f"The Housing Agency: {len(opportunities)} opportunities read; {added} new opportunities."
