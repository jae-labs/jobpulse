"""Generic HTML listing parser and ATS provider dispatcher."""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import urljoin

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text, extract_surrounding_text
from engine.validators import is_valid_job_title
from scrapers.providers import (
    extract_amazon_opportunities,
    extract_ashby_opportunities,
    extract_bamboohr_opportunities,
    extract_booklet_opportunities,
    extract_candidatemanager_opportunities,
    extract_corehr_table_opportunities,
    extract_greenhouse_opportunities,
    extract_hubspot_opportunities,
    extract_jobtrain_opportunities,
    extract_jsonld_opportunities,
    extract_lever_opportunities,
    extract_lidl_opportunities,
    extract_linkedin_opportunities,
    extract_musgrave_opportunities,
    extract_oracle_opportunities,
    extract_personio_opportunities,
    extract_rezoomo_opportunities,
    extract_smartrecruiters_opportunities,
    extract_teamtailor_opportunities,
    extract_thehirelab_opportunities,
    extract_workable_opportunities,
    extract_workday_opportunities,
)

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
        inner_h = re.search(r"<h[1-5][^>]*>(.*?)</h[1-5]>", t, re.I | re.DOTALL)
        ct = (
            clean_text(inner_h.group(1))
            if inner_h and is_valid_job_title(clean_text(inner_h.group(1)), h)
            else clean_text(t)
        )
        full = urljoin(listing_url, html.unescape(h.strip()))
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
                    loc = (
                        "Dublin, Ireland"
                        if any(k in f"{full} {clean_title} {ctx_snippet}".lower() for k in ["dublin", "cork", "galway"])
                        else "Ireland"
                    )
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


def extract_jobs_from_listing(employer_name: str, listing_url: str, html_content: str) -> list[dict[str, Any]]:
    """Parse career listing pages into normalized opportunity dictionaries.

    Dispatches to dedicated ATS and structured-data adapters first, then falls back
    to anchor heuristics and candidate booklets.
    """
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    def _collect(records: list[dict[str, Any]]) -> None:
        for r in records:
            u = r.get("url")
            if u and u not in seen_urls:
                seen_urls.add(u)
                opportunities.append(r)

    # 1. Specialized ATS API Adapters
    _collect(extract_candidatemanager_opportunities(employer_name, listing_url, html_content))
    _collect(extract_workday_opportunities(employer_name, listing_url))
    _collect(extract_oracle_opportunities(employer_name, listing_url))
    _collect(extract_rezoomo_opportunities(employer_name, listing_url))
    _collect(extract_workable_opportunities(employer_name, listing_url))
    _collect(extract_bamboohr_opportunities(employer_name, listing_url))
    _collect(extract_greenhouse_opportunities(employer_name, listing_url, html_content))
    _collect(extract_ashby_opportunities(employer_name, listing_url, html_content))
    _collect(extract_lever_opportunities(employer_name, listing_url, html_content))
    _collect(extract_smartrecruiters_opportunities(employer_name, listing_url, html_content))
    _collect(extract_amazon_opportunities(employer_name, listing_url))
    _collect(extract_hubspot_opportunities(employer_name, listing_url))
    _collect(extract_jobtrain_opportunities(employer_name, listing_url, html_content))
    _collect(extract_lidl_opportunities(employer_name, listing_url))
    _collect(extract_musgrave_opportunities(employer_name, html_content))
    _collect(extract_personio_opportunities(employer_name, listing_url, html_content))
    _collect(extract_teamtailor_opportunities(employer_name, listing_url, html_content))

    # 2. LinkedIn Guest Search Cards (if present, returns early)
    li_opportunities = extract_linkedin_opportunities(employer_name, listing_url, html_content)
    if li_opportunities:
        _collect(li_opportunities)
        return opportunities

    # 3. Schema.org JSON-LD
    _collect(extract_jsonld_opportunities(employer_name, listing_url, html_content, seen_urls))

    # Extract raw anchor tags once for document and generic HTML parsing
    raw_links = re.findall(
        r"<a\s+[^>]*href=(?:[\"\']([^\"\']+)[\"\']|([^\s>]+))[^>]*>(.*?)</a>",
        html_content,
        re.I | re.DOTALL,
    )
    parsed_links = [(h1 or h2, t) for h1, h2, t in raw_links]

    # 4. Candidate Information Booklets & PDF Vacancies
    _collect(extract_booklet_opportunities(employer_name, listing_url, html_content, links=parsed_links))

    # 5. CoreHR & TheHireLab table rows
    _collect(extract_corehr_table_opportunities(employer_name, listing_url, html_content))
    _collect(extract_thehirelab_opportunities(employer_name, listing_url, html_content))

    # 6. Standard /job/, /vacancy/, /viewjob/ HTML link heuristics
    _collect(extract_html_link_opportunities(employer_name, listing_url, html_content, parsed_links, seen_urls))

    return opportunities
