"""Validation helpers for job titles and location filtering."""

from __future__ import annotations

import re
import urllib.parse

from config.rules import (
    ALLOWED_SINGLE_WORD_JOBS,
    GENERIC_NON_JOB_TITLES,
    NON_IRELAND_PATTERNS,
    SPECIFIC_IRISH_PLACES,
)


def is_valid_location(location: str, title: str = "", url: str = "") -> bool:
    """Verify that the job location is within Ireland and not overseas."""
    title_l = title.lower()
    loc_l = location.lower()
    url_l = url.lower()
    combined_foreign = f"{title_l} {loc_l} {url_l}"

    # Explicit known foreign locations
    if (
        loc_l
        in [
            "krakow, poland",
            "warszawa",
            "warszawa - polna 11",
            "barcelona",
            "krakow, high 5ive development",
            "windsor",
            "merseyside",
            "uxbridge",
            "leicester",
            "aalborg",
            "lutterworth",
            "stockport",
            "copenhagen",
            "flexible",
        ]
        and "ireland" not in loc_l
    ):
        return False

    has_foreign = any(bool(re.search(pat, combined_foreign, re.IGNORECASE)) for pat in NON_IRELAND_PATTERNS)
    if has_foreign:
        has_specific_irish_loc = any(bool(re.search(pat, loc_l, re.IGNORECASE)) for pat in SPECIFIC_IRISH_PLACES)
        if has_specific_irish_loc:
            if not re.search(r"dublin\s*,\s*(?:oh|ca|va|ga|texas)", loc_l):
                return True
        if re.search(r"/(?:ie|ireland|dublin|cork|galway)/", url_l) and not any(
            bool(re.search(pat, f"{title_l} {url_l}", re.IGNORECASE))
            for pat in [
                r"/job/(?:lodz|krakow|warsaw|bengaluru|hyderabad|madrid|barcelona)/",
                r"\b(?:india,\s*telangana|india,\s*karnataka|us-mn|us-ny)\b",
            ]
        ):
            return True
        return False

    is_ireland = bool(
        re.search(
            r"\b(?:ireland|dublin|kildare|maynooth|naas|leixlip|cork|galway|limerick|waterford|meath|wicklow|louth|kerry|sligo|donegal|clare|carlow|kilkenny|tipperary|wexford|westmeath|laois|offaly|cavan|monaghan|leitrim|roscommon|longford|mayo)\b",
            combined_foreign,
        )
    )
    return (
        is_ireland
        or not location
        or location.lower() in {"not specified", "unspecified", "various", "hybrid", "remote"}
    )


def is_valid_job_title(title: str, url: str = "") -> bool:
    """Validate that text is a real job role and not a website navigation button or banner."""
    clean = re.sub(r"\s+", " ", title).strip()
    clean_l = clean.lower()

    if len(clean) < 3 or len(clean) > 150:
        return False

    # Check non-Latin characters (reject non-English/Latin script like Chinese)
    latin_chars = len(re.findall(r"[a-zA-Z0-9]", clean))
    if latin_chars < 3 or (latin_chars / max(1, len(clean))) < 0.6:
        return False

    url_fragment = urllib.parse.urlparse(url).fragment.lower()
    if url_fragment in {"main-content", "content", "maincontent", "main", "nav", "header", "footer", "top", "skip"}:
        return False

    # Filter out navigation/filter query URLs that don't point to individual jobs
    url_l = url.lower()
    if any(
        q in url_l
        for q in [
            "?ryanair-jobs-location=",
            "?ryanair-jobs-department=",
            "mypage=",
            "?start=",
            "posbrowser_resetto",
            "/saved-jobs/",
            "brand-6/",
            "trk=organization_guest-browse_jobs",
            "trk=public_jobs",
            "/jobs/page/",
        ]
    ):
        return False

    if url_l.endswith("/#") or url_l.endswith("#"):
        return False

    # Reject LinkedIn directory URLs that aren't individual job postings
    if "linkedin.com/jobs/" in url_l and "/view/" not in url_l:
        return False

    # Filter out non-Ireland LinkedIn regional subdomains (e.g. in., jp., au., ca., de., fr., tw., cr.)
    if re.search(r"https?://(?!ie\.|www\.)[a-z]{2}\.linkedin\.com", url_l):
        return False

    if clean_l in {
        "skip branding",
        "terms and conditions",
        "job cart 0",
        "jobs 44",
        "loading...",
        "skip to main content",
    }:
        return False

    if "website terms of use" in url_l:
        return False

    if clean_l in GENERIC_NON_JOB_TITLES:
        return False

    # Reject category counters like "Executive jobs 690,514 open jobs", "555,845 open jobs", etc.
    if re.search(r"\b\d[\d,]*\s+(?:open\s+)?jobs\b", clean_l) or re.search(
        r"\b(?:open\s+jobs|open\s+positions)\b", clean_l
    ):
        return False

    words = clean.split()
    if len(words) == 1 and clean_l not in ALLOWED_SINGLE_WORD_JOBS:
        return False

    if any(
        clean_l.startswith(prefix)
        for prefix in [
            "skip to ",
            "jump to ",
            "register for job alerts",
            "get job alerts",
            "sign in to",
            "log in to",
            "apply for this",
            "apply to ",
            "apply now",
            "see all ",
            "view all ",
            "back to ",
            "view saved jobs",
            "filter your ",
            "go to next ",
            "go to last ",
            "go to previous ",
            "go to page ",
        ]
    ):
        return False

    if re.match(r"^page\s+\d+$", clean_l):
        return False

    if any(
        phrase in clean_l
        for phrase in [
            "skip to content",
            "skip to main",
            "jump to content",
            "register for job alerts",
            "email when new jobs",
            "subscribe to job",
            "create alert",
            "job alerts get an email",
            "join our team",
        ]
    ):
        return False

    return True
