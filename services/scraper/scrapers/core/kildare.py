"""Kildare County Council careers scraper."""

from __future__ import annotations

import html
import re
from urllib.parse import unquote, urljoin

from config.loader import KILDARE_CAREERS_URL
from database.repository import save_job, update_source_status
from network.http_client import fetch_page


def sync_kildare() -> tuple[int, str]:
    """Scrape Kildare County Council candidate information booklet PDFs."""
    page = fetch_page(KILDARE_CAREERS_URL)
    pattern = r'href="([^"]*Candidate[^"]*\.pdf)"'
    links = list(dict.fromkeys(re.findall(pattern, page, flags=re.IGNORECASE)))
    read = 0
    added = 0
    for link in links:
        filename = html.unescape(unquote(link.rsplit("/", 1)[-1]))
        title = re.sub(
            r"\s*Candidate Information Booklet.*$|\s*rolling competition.*$|\.pdf$", "", filename, flags=re.I
        )
        title = re.sub(r"\s+", " ", title).strip(" -")
        if title:
            if save_job(
                {
                    "title": title,
                    "company": "Kildare County Council",
                    "location": "County Kildare",
                    "employment_type": "See job post",
                    "description": f"Official Kildare County Council vacancy: {title}. Review the candidate information booklet for duties, grade, contract terms, and closing date.",
                    "url": urljoin(KILDARE_CAREERS_URL, link),
                    "source": "Kildare County Council",
                }
            ):
                added += 1
            read += 1

    detail = f"Read {read} current opportunity booklets; added {added} new opportunities."
    update_source_status("Kildare County Council", "Synced", detail, opportunities_found=read)
    return added, f"Kildare County Council: {read} opportunity booklets read; {added} new opportunities."
