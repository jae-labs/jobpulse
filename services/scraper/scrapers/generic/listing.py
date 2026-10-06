"""Generic HTML listing parser and ATS provider dispatcher."""

from __future__ import annotations

import html
import re
from collections.abc import Callable
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
    extract_breezy_opportunities,
    extract_candidatemanager_opportunities,
    extract_corehr_table_opportunities,
    extract_dayforce_opportunities,
    extract_eightfold_opportunities,
    extract_greenhouse_opportunities,
    extract_hubspot_opportunities,
    extract_icims_opportunities,
    extract_jobtrain_opportunities,
    extract_jsonld_opportunities,
    extract_lever_opportunities,
    extract_lidl_opportunities,
    extract_linkedin_opportunities,
    extract_manatal_opportunities,
    extract_musgrave_opportunities,
    extract_oracle_opportunities,
    extract_personio_opportunities,
    extract_phenom_opportunities,
    extract_pinpoint_opportunities,
    extract_recruitee_opportunities,
    extract_rezoomo_opportunities,
    extract_rippling_opportunities,
    extract_sitemap_opportunities,
    extract_smartrecruiters_opportunities,
    extract_teamtailor_opportunities,
    extract_thehirelab_opportunities,
    extract_ukg_opportunities,
    extract_workable_opportunities,
    extract_workday_opportunities,
    extract_zoho_opportunities,
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

# (employer, listing_url, html) -> opportunities. A known catalog provider is tried
# first so a board behind a vanity domain is still read through its own API.
EMPTY_BOARD_PROVIDERS = frozenset(
    {
        "greenhouse",
        "lever",
        "ashby",
        "smartrecruiters",
        "workable",
        "bamboohr",
        "breezy",
        "pinpoint",
        "rippling",
        "ukg",
        "zohorecruit",
    }
)

_PROVIDER_EXTRACTORS: dict[str, Callable[[str, str, str], list[dict[str, Any]]]] = {
    "greenhouse": lambda n, u, h: extract_greenhouse_opportunities(n, u, h),
    "lever": lambda n, u, h: extract_lever_opportunities(n, u, h),
    "ashby": lambda n, u, h: extract_ashby_opportunities(n, u, h),
    "smartrecruiters": lambda n, u, h: extract_smartrecruiters_opportunities(n, u, h),
    "workable": lambda n, u, h: extract_workable_opportunities(n, u),
    "bamboohr": lambda n, u, h: extract_bamboohr_opportunities(n, u),
    "personio": lambda n, u, h: extract_personio_opportunities(n, u, h),
    "teamtailor": lambda n, u, h: extract_teamtailor_opportunities(n, u, h),
    "recruitee": lambda n, u, h: extract_recruitee_opportunities(n, u),
    "workday": lambda n, u, h: extract_workday_opportunities(n, u),
    "oracle": lambda n, u, h: extract_oracle_opportunities(n, u),
    "rezoomo": lambda n, u, h: extract_rezoomo_opportunities(n, u),
    "amazon": lambda n, u, h: extract_amazon_opportunities(n, u),
    "hubspot": lambda n, u, h: extract_hubspot_opportunities(n, u),
    "candidatemanager": lambda n, u, h: extract_candidatemanager_opportunities(n, u, h),
    "jobtrain": lambda n, u, h: extract_jobtrain_opportunities(n, u, h),
    "lidl": lambda n, u, h: extract_lidl_opportunities(n, u),
    "musgrave": lambda n, u, h: extract_musgrave_opportunities(n, h),
    "linkedin": lambda n, u, h: extract_linkedin_opportunities(n, u, h),
    "corehr": lambda n, u, h: extract_corehr_table_opportunities(n, u, h),
    "breezy": lambda n, u, h: extract_breezy_opportunities(n, u, h),
    "pinpoint": lambda n, u, h: extract_pinpoint_opportunities(n, u, h),
    "rippling": lambda n, u, h: extract_rippling_opportunities(n, u, h),
    "ukg": lambda n, u, h: extract_ukg_opportunities(n, u, h),
    "icims": lambda n, u, h: extract_icims_opportunities(n, u, h),
    "eightfold": lambda n, u, h: extract_eightfold_opportunities(n, u, h),
    "dayforce": lambda n, u, h: extract_dayforce_opportunities(n, u, h),
    "radancy": lambda n, u, h: extract_sitemap_opportunities(n, u, h),
    "successfactors": lambda n, u, h: extract_sitemap_opportunities(n, u, h),
    "jobvite": lambda n, u, h: extract_sitemap_opportunities(n, u, h),
    "avature": lambda n, u, h: extract_sitemap_opportunities(n, u, h),
    "sitemap": lambda n, u, h: extract_sitemap_opportunities(n, u, h),
    "manatal": lambda n, u, h: extract_manatal_opportunities(n, u, h),
    "phenom": lambda n, u, h: extract_phenom_opportunities(n, u, h),
    "zohorecruit": lambda n, u, h: extract_zoho_opportunities(n, u, h),
}


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


def extract_jobs_from_listing(
    employer_name: str,
    listing_url: str,
    html_content: str,
    provider: str | None = None,
) -> list[dict[str, Any]]:
    """Dispatch known API boards directly; otherwise use structured and HTML adapters."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    def _collect(records: list[dict[str, Any]]) -> None:
        for r in records:
            u = r.get("url")
            if u and u not in seen_urls:
                seen_urls.add(u)
                opportunities.append(r)

    if provider in EMPTY_BOARD_PROVIDERS:
        return _PROVIDER_EXTRACTORS[provider](employer_name, listing_url, html_content)
    if provider and (extractor := _PROVIDER_EXTRACTORS.get(provider)):
        _collect(extractor(employer_name, listing_url, html_content))
        if opportunities:
            return opportunities

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
    _collect(extract_recruitee_opportunities(employer_name, listing_url))
    _collect(extract_teamtailor_opportunities(employer_name, listing_url, html_content))
    _collect(extract_breezy_opportunities(employer_name, listing_url, html_content))
    _collect(extract_pinpoint_opportunities(employer_name, listing_url, html_content))
    _collect(extract_rippling_opportunities(employer_name, listing_url, html_content))
    _collect(extract_ukg_opportunities(employer_name, listing_url, html_content))
    _collect(extract_icims_opportunities(employer_name, listing_url, html_content))
    _collect(extract_eightfold_opportunities(employer_name, listing_url, html_content))
    _collect(extract_dayforce_opportunities(employer_name, listing_url, html_content))
    _collect(extract_manatal_opportunities(employer_name, listing_url, html_content))
    _collect(extract_zoho_opportunities(employer_name, listing_url, html_content))

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

    # 7. Last resort for career-site hosts with no listing API (Radancy, SuccessFactors,
    # Jobvite and the long tail): read the site's sitemap and each posting's schema.org
    # detail page. Only when nothing else matched, so the extra fetches stay rare.
    if not opportunities and (provider is None or provider == "generic"):
        _collect(extract_sitemap_opportunities(employer_name, listing_url, html_content))

    return opportunities
