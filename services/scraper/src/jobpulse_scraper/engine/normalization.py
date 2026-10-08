"""Pure catalog identities preserve PostgreSQL and provider URL contracts."""

import hashlib
import re
import urllib.parse

from jobpulse_scraper.engine.text_cleaner import normalize_location


def normalize_company_name(company: str) -> str:
    """Standardize employer names for deterministic deduplication."""
    if not company:
        return ""
    c = company.lower().strip()
    c = re.sub(r"\b(?:ireland|limited|ltd|plc|dac|inc|corp|corporation|group|llc|holdings|company|co)\b", " ", c)
    c = re.sub(r"[^a-z0-9]+", " ", c).strip()
    return c


def normalize_job_title(title: str) -> str:
    """Standardize job titles by stripping requisition IDs, location tags, contract markers, and year suffixes."""
    if not title:
        return ""
    t = title.lower().strip()
    t = re.sub(r"&[a-z]+;", " ", t)
    # Strip location or work mode suffixes separated by dash/slash/pipe
    t = re.split(
        r"\s+[-–—|/]\s+(?:dublin|cork|galway|ireland|kildare|maynooth|limerick|waterford|remote|hybrid|onsite)", t
    )[0]
    # Strip requisition/reference codes: (Ref: 1234), [Req 5678], #12345
    t = re.sub(r"[\(\[\{]?(?:ref|req|requisition|job id|id)[:\s#]*[a-z0-9-]+[\)\]\}]?", " ", t)
    # Strip contract tags: (Fixed-Term), (Permanent), (Full-time), etc.
    t = re.sub(
        r"[\(\[\{]?(?:fixed[- ]term|permanent|temporary|contract|specified purpose|full[- ]time|part[- ]time)[\)\]\}]?",
        " ",
        t,
    )
    # Strip standard location in parenthesis at end of title: (Dublin), (Hybrid), (Remote)
    t = re.sub(
        r"\((?:dublin|cork|galway|ireland|kildare|maynooth|limerick|waterford|remote|hybrid|onsite|various locations)\)$",
        " ",
        t,
    )
    # Strip trailing year if isolated at end: 'Higher Executive Officer 2026'
    t = re.sub(r"\b202[0-9]\b", " ", t)
    # Normalize common abbreviations
    t = re.sub(r"\bsr\.?\b", "senior", t)
    t = re.sub(r"\bjr\.?\b", "junior", t)
    t = re.sub(r"\bmgr\.?\b", "manager", t)
    t = re.sub(r"\beng\.?\b", "engineer", t)
    t = re.sub(r"\bdev\.?\b", "developer", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t


TRACKING_QUERY_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "source",
    "gh_src",
    "lever-source",
    "fbclid",
    "gclid",
    "twclid",
    "mc_eid",
    "trk",
    "tracking",
    "st",
}


def canonical_job_url(url: str) -> str:
    """Normalize an ATS job URL without collapsing distinct requisitions."""
    clean = (url or "").strip()
    if not clean:
        return ""
    try:
        parsed = urllib.parse.urlparse(clean)
        query_params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
        filtered = [(k, v) for k, v in query_params if k.lower() not in TRACKING_QUERY_PARAMS]
        path = parsed.path.rstrip("/")
        if filtered:
            sorted_query = urllib.parse.urlencode(sorted(filtered))
            canonical = f"{parsed.scheme}://{parsed.netloc}{path}?{sorted_query}"
        else:
            canonical = f"{parsed.scheme}://{parsed.netloc}{path}"
        return canonical.lower()
    except Exception:
        clean = re.sub(r"[#].*$", "", clean)
        return clean.rstrip("/").lower()


def normalized_key(
    company: str,
    title: str,
    url: str = "",
    location: str = "",
    employment_type: str = "",
) -> str:
    """Generate a stable opportunity key, preferring the provider's canonical URL."""
    norm_comp = normalize_company_name(company)
    canonical_url = canonical_job_url(url)
    if canonical_url:
        identity = f"url::{canonical_url}"
    else:
        identity = "::".join(
            (
                normalize_job_title(title),
                normalize_location(location).lower(),
                (employment_type or "").strip().lower(),
            )
        )
    # Match PostgreSQL's md5() re-key format; this is not a security hash.
    return hashlib.md5(f"{norm_comp}::{identity}".encode(), usedforsecurity=False).hexdigest()
