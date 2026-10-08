"""Pure generic careers-link parsing from supplied HTML."""

import html
import re
from typing import Any
from urllib.parse import urljoin

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_text, extract_surrounding_text
from jobpulse_scraper.engine.validators import is_valid_job_title
from jobpulse_scraper.scrapers.parsers.html_tree import Element, TreeParser

ATS_URL_PATTERNS = [
    "/job/",
    "/jobs/",
    "/vacancy/",
    "/vacancies/",
    "/career/",
    "/careers/",
    "pjobdetails",
    "jobdetail",
    "requisition",
    "viewjob",
    "/livejobs/",
    "/projects/",
    "/candidate/listing/",
    "/search-jobs/",
    "/search/",
    "current_vacancies",
    "current-vacancies",
    "job-vacancies",
    "career-opportunities",
    "working-at",
    "/roles/",
    "/careers/job/",
    "/careers-in-",
    "/opp/",
    "/job_details/",
    "/profile/job_details/",
    "/details/",
    "searchjobs",
]

GENERIC_ANCHOR_TEXTS = {
    "view",
    "apply",
    "apply now",
    "view job",
    "more..",
    "here",
    "click here",
    "read more",
}

NON_JOB_TITLE_SKIPS = [
    "privacy",
    "cookie",
    "terms",
    "more",
    "all jobs",
    "home",
    "back",
    "contact",
    "search",
    "read",
    "view all",
    "why work",
    "why join",
    "benefits",
    "about us",
    "life at",
    "how to apply",
    "working here",
    "equal opportunities",
    "diversity",
    "talent network",
    "talent community",
    "join talent",
    "warehouse & transport",
    "head office",
    "area managers",
    "see full role description",
    "see role description",
    "see description",
]


def extract_html_link_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
    links: list[tuple[str, str]],
    seen_urls: set[str],
) -> list[dict[str, Any]]:
    """Fallback extractor that parses standard /job/, /vacancy/, /viewjob/ HTML links."""
    opportunities: list[dict[str, Any]] = []

    for h, t in links:
        full = urljoin(listing_url, html.unescape(h.strip()))
        card_location: str | None = None
        # A linked Elementor card owns its title and location. Adjacent cards
        # and page-wide country filters are not evidence for this vacancy.
        if "elementor-widget-theme-post-title" in t:
            nodes = list(TreeParser(t).root.elements())
            title_node = next(
                (node for node in nodes if "elementor-widget-theme-post-title" in node.attrs.get("class", "").split()),
                None,
            )
            locations = [
                clean_text(node.text)
                for node in nodes
                if node.tag == "span"
                and not any(isinstance(child, Element) for child in node.children)
                and len(node.text) <= 120
                and is_explicit_ireland_location(node.text)
            ]
            if title_node is not None:
                if not locations:
                    continue
                ct = clean_text(title_node.text)
                card_location = locations[0]
            else:
                ct = clean_text(t)
        else:
            ct = clean_text(t)
        inner_h = re.search(r"<h[1-5][^>]*>(.*?)</h[1-5]>", t, re.I | re.DOTALL)
        if card_location is None and inner_h and is_valid_job_title(clean_text(inner_h.group(1)), h):
            ct = clean_text(inner_h.group(1))
        clean_title = re.sub(r"\s*(?:View Job|Apply Now|Apply Online|Job ID #\d+).*$", "", ct, flags=re.I).strip()
        clean_title = re.sub(r"^[►▼•\-\*>\s]+", "", clean_title).strip()

        # Fallback to card header or title div if anchor text is generic
        if clean_title.lower() in GENERIC_ANCHOR_TEXTS:
            ctx_snippet = extract_surrounding_text(html_content, h)
            header_match = re.search(r"<h[1-5][^>]*>(.*?)</h[1-5]>", ctx_snippet, re.I | re.DOTALL)
            if not header_match:
                header_match = re.search(
                    r"<div[^>]*class=[\"\'][^\"\']*title[^\"\']*[\"\'][^>]*>(.*?)</div>",
                    ctx_snippet,
                    re.I | re.DOTALL,
                )
            if header_match:
                cand = clean_text(header_match.group(1))
                if is_valid_job_title(cand, full):
                    clean_title = cand

        if not is_valid_job_title(clean_title, full):
            continue

        if any(p in full.lower() for p in ATS_URL_PATTERNS) and len(clean_title) > 4:
            if not any(skip in clean_title.lower() for skip in NON_JOB_TITLE_SKIPS):
                if (
                    not h.endswith(".pdf")
                    and not full.rstrip("/").endswith("/jobs")
                    and not full.rstrip("/").endswith("/careers")
                    and full.rstrip("/") != listing_url.rstrip("/")
                    and "/careers/join" not in full.lower()
                    and full not in seen_urls
                ):
                    seen_urls.add(full)
                    desc = (
                        f"{employer_name} opportunity: {clean_title}. "
                        "Check the official vacancy post for details, duties, and closing date."
                    )
                    ctx_snippet = extract_surrounding_text(html_content, h)
                    salary = extract_salary_from_context(ctx_snippet, clean_title)
                    # Preserve unknown locations instead of inventing a city
                    # from surrounding cards. Detail enrichment supplies proof.
                    loc = card_location or ""
                    opportunities.append(
                        {
                            "title": clean_title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": "See job post",
                            "salary_text": salary,
                            "description": desc,
                            "url": full,
                            "source": employer_name,
                        }
                    )

    return opportunities
