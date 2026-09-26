"""Generic HTML job detail extractor."""

from __future__ import annotations

import re

from engine.text_cleaner import clean_html_description
from network.http_client import fetch_page


def extract_general_job_detail(job_url: str, company: str, title: str) -> dict[str, str]:
    """Fetch URL and extract main job specification text using article/main tags or clean text."""
    try:
        page = fetch_page(job_url)
        if not page:
            return {}
        art_match = re.search(r"<(?:article|main)[^>]*>(.*?)</(?:article|main)>", page, flags=re.DOTALL | re.IGNORECASE)
        if art_match:
            cl = clean_html_description(art_match.group(1))
        else:
            no_s = re.sub(
                r"<(?:script|style|nav|header|footer|svg)[^>]*>.*?</(?:script|style|nav|header|footer|svg)>",
                " ",
                page,
                flags=re.DOTALL | re.IGNORECASE,
            )
            cl = clean_html_description(no_s)

        full_spec = cl[:25000].strip()
        return {
            "description": full_spec,
        }
    except Exception:
        return {}
