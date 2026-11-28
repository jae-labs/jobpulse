"""Generic HTML listing parser and ATS provider dispatcher."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.generic_html import (
    extract_html_link_opportunities as extract_html_link_opportunities,
)
from jobpulse_scraper.scrapers.providers import (
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

_PROVIDER_EXTRACTORS: dict[str, Callable[[str, str, str, RequestOpener | None], list[dict[str, Any]]]] = {
    "greenhouse": lambda n, u, h, request_opener=None: extract_greenhouse_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "lever": lambda n, u, h, request_opener=None: extract_lever_opportunities(n, u, h, request_opener=request_opener),
    "ashby": lambda n, u, h, request_opener=None: extract_ashby_opportunities(n, u, h, request_opener=request_opener),
    "smartrecruiters": lambda n, u, h, request_opener=None: extract_smartrecruiters_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "workable": lambda n, u, h, request_opener=None: extract_workable_opportunities(
        n, u, request_opener=request_opener
    ),
    "bamboohr": lambda n, u, h, request_opener=None: extract_bamboohr_opportunities(
        n, u, request_opener=request_opener
    ),
    "personio": lambda n, u, h, request_opener=None: extract_personio_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "teamtailor": lambda n, u, h, request_opener=None: extract_teamtailor_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "recruitee": lambda n, u, h, request_opener=None: extract_recruitee_opportunities(
        n, u, request_opener=request_opener
    ),
    "workday": lambda n, u, h, request_opener=None: extract_workday_opportunities(n, u, request_opener=request_opener),
    "oracle": lambda n, u, h, request_opener=None: extract_oracle_opportunities(n, u, request_opener=request_opener),
    "rezoomo": lambda n, u, h, request_opener=None: extract_rezoomo_opportunities(n, u, request_opener=request_opener),
    "amazon": lambda n, u, h, request_opener=None: extract_amazon_opportunities(n, u, request_opener=request_opener),
    "hubspot": lambda n, u, h, request_opener=None: extract_hubspot_opportunities(n, u, request_opener=request_opener),
    "candidatemanager": lambda n, u, h, request_opener=None: extract_candidatemanager_opportunities(n, u, h),
    "jobtrain": lambda n, u, h, request_opener=None: extract_jobtrain_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "lidl": lambda n, u, h, request_opener=None: extract_lidl_opportunities(n, u, request_opener=request_opener),
    "musgrave": lambda n, u, h, request_opener=None: extract_musgrave_opportunities(n, h),
    "linkedin": lambda n, u, h, request_opener=None: extract_linkedin_opportunities(n, u, h),
    "corehr": lambda n, u, h, request_opener=None: extract_corehr_table_opportunities(n, u, h),
    "breezy": lambda n, u, h, request_opener=None: extract_breezy_opportunities(n, u, h, request_opener=request_opener),
    "pinpoint": lambda n, u, h, request_opener=None: extract_pinpoint_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "rippling": lambda n, u, h, request_opener=None: extract_rippling_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "ukg": lambda n, u, h, request_opener=None: extract_ukg_opportunities(n, u, h, request_opener=request_opener),
    "icims": lambda n, u, h, request_opener=None: extract_icims_opportunities(n, u, h, request_opener=request_opener),
    "eightfold": lambda n, u, h, request_opener=None: extract_eightfold_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "dayforce": lambda n, u, h, request_opener=None: extract_dayforce_opportunities(n, u, h),
    "radancy": lambda n, u, h, request_opener=None: extract_sitemap_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "successfactors": lambda n, u, h, request_opener=None: extract_sitemap_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "jobvite": lambda n, u, h, request_opener=None: extract_sitemap_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "avature": lambda n, u, h, request_opener=None: extract_sitemap_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "sitemap": lambda n, u, h, request_opener=None: extract_sitemap_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "manatal": lambda n, u, h, request_opener=None: extract_manatal_opportunities(
        n, u, h, request_opener=request_opener
    ),
    "phenom": lambda n, u, h, request_opener=None: extract_phenom_opportunities(n, u, h, request_opener=request_opener),
    "zohorecruit": lambda n, u, h, request_opener=None: extract_zoho_opportunities(
        n, u, h, request_opener=request_opener
    ),
}


def extract_jobs_from_listing(
    employer_name: str,
    listing_url: str,
    html_content: str,
    provider: str | None = None,
    *,
    request_opener: RequestOpener | None = None,
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
        return _PROVIDER_EXTRACTORS[provider](employer_name, listing_url, html_content, request_opener)
    if provider and (extractor := _PROVIDER_EXTRACTORS.get(provider)):
        _collect(extractor(employer_name, listing_url, html_content, request_opener))
        if opportunities:
            return opportunities

    # 1. Specialized ATS API Adapters
    _collect(extract_candidatemanager_opportunities(employer_name, listing_url, html_content))
    _collect(extract_workday_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_oracle_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_rezoomo_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_workable_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_bamboohr_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_greenhouse_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_ashby_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_lever_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(
        extract_smartrecruiters_opportunities(employer_name, listing_url, html_content, request_opener=request_opener)
    )
    _collect(extract_amazon_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_hubspot_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_jobtrain_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_lidl_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_musgrave_opportunities(employer_name, html_content))
    _collect(extract_personio_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_recruitee_opportunities(employer_name, listing_url, request_opener=request_opener))
    _collect(extract_teamtailor_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_breezy_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_pinpoint_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_rippling_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_ukg_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_icims_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_eightfold_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_dayforce_opportunities(employer_name, listing_url, html_content))
    _collect(extract_manatal_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))
    _collect(extract_zoho_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))

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
        _collect(extract_sitemap_opportunities(employer_name, listing_url, html_content, request_opener=request_opener))

    return opportunities
