"""Pure iCIMS listing-card parsing."""

import html
import re
from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_text

_CARD = re.compile(r"<li[^>]*iCIMS_JobCardItem[^>]*>(.*?)</li>", re.I | re.DOTALL)

_TITLE = re.compile(r"<h3[^>]*>(.*?)</h3>", re.I | re.DOTALL)

_HREF = re.compile(r'<a[^>]*href="([^"]*?/jobs/[^"]+?)"', re.I)

_LOCATION = re.compile(r'field-label">(?:Job\s+)?Locations?</span>\s*<span[^>]*>(.*?)</span>', re.I | re.DOTALL)

_DESCRIPTION = re.compile(r'col-xs-12 description">(.*?)</div>', re.I | re.DOTALL)


def _location(raw: str) -> tuple[str, bool]:
    """Return (display, is_irish). Country-coded locations are authoritative."""
    text = clean_text(html.unescape(raw))
    alternatives = [part.strip() for part in text.split("|")]
    if len(alternatives) > 1:
        irish = [_location(part)[0] for part in alternatives if _location(part)[1]]
        return "; ".join(irish) if irish else text, bool(irish)
    prefixed = re.match(r"^([A-Za-z]{2})-(.+)$", text)
    if prefixed:
        country = prefixed.group(1).upper()
        place = re.sub(r"-\s*", ", ", prefixed.group(2)).strip()
        display = f"{place}, Ireland" if country == "IE" else f"{place}, {country}"
        return display, country == "IE"
    return text, is_explicit_ireland_location(text)


def parse_icims_page(employer_name: str, page_html: str) -> list[dict[str, Any]]:
    cards = _CARD.findall(page_html)
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for card in cards:
        title_match = _TITLE.search(card)
        href_match = _HREF.search(card)
        if not title_match or not href_match:
            continue
        title = clean_text(title_match.group(1))
        job_url = html.unescape(href_match.group(1)).split("?")[0]
        location_match = _LOCATION.search(card)
        location, is_irish = _location(location_match.group(1) if location_match else "")
        if not is_irish or not title or job_url in seen_urls:
            continue
        seen_urls.add(job_url)
        description_match = _DESCRIPTION.search(card)
        description = clean_text(description_match.group(1)) if description_match else ""
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": "See job post",
                "salary_text": extract_salary_from_context(description or location, title),
                "description": description or f"{employer_name} position: {title}. Location: {location}.",
                "url": job_url,
                "source": employer_name,
            }
        )
    return opportunities
