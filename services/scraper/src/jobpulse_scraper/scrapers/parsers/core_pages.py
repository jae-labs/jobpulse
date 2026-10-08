"""Pure official careers-page and candidate-booklet parsing."""

import html
import re
from urllib.parse import unquote, urljoin

from jobpulse_scraper.config.loader import KILDARE_CAREERS_URL
from jobpulse_scraper.engine.text_cleaner import clean_text


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


def parse_housing_agency_page(page: str) -> list[dict[str, object]]:
    """Parse public listing facts without persistence or detail downloads."""
    opportunities = extract_housing_agency_jobs(page)
    jobs_to_save = []
    if not opportunities and not any(
        marker in page.lower() for marker in ("no current", "no open", "no vacancies", "no opportunities")
    ):
        raise ValueError("Unrecognized Housing Agency listing")

    for title, url in opportunities:
        jobs_to_save.append(
            {
                "description_is_snippet": True,
                "title": title,
                "company": "The Housing Agency",
                "location": "Dublin - see job post",
                "employment_type": "See job post",
                "description": f"The Housing Agency vacancy: {title}. Check the official posting for salary, contract terms, responsibilities, and closing date.",
                "url": url,
                "source": "The Housing Agency",
            }
        )

    return jobs_to_save


def parse_kildare_page(page: str) -> list[dict[str, object]]:
    """Parse supplied council booklet links without downloading or writing."""
    pattern = r'href="([^"]*Candidate[^"]*\.pdf)"'
    links = list(dict.fromkeys(re.findall(pattern, page, flags=re.IGNORECASE)))
    jobs_to_save = []
    if not links and not any(marker in page.lower() for marker in ("no current", "no vacancies", "no opportunities")):
        raise ValueError("Unrecognized Kildare listing")
    for link in links:
        filename = html.unescape(unquote(link.rsplit("/", 1)[-1]))
        title = re.sub(
            r"\s*Candidate Information Booklet.*$|\s*rolling competition.*$|\.pdf$", "", filename, flags=re.I
        )
        title = re.sub(r"\s+", " ", title).strip(" -")
        if title:
            jobs_to_save.append(
                {
                    "description_is_snippet": True,
                    "title": title,
                    "company": "Kildare County Council",
                    "location": "County Kildare",
                    "employment_type": "See job post",
                    "description": f"Official Kildare County Council vacancy: {title}. Review the candidate information booklet for duties, grade, contract terms, and closing date.",
                    "url": urljoin(KILDARE_CAREERS_URL, link),
                    "source": "Kildare County Council",
                }
            )

    return jobs_to_save
