"""Automated careers page discovery and ATS portal detector."""

from __future__ import annotations

import html
import re
import urllib.parse
from urllib.parse import urljoin

from engine.text_cleaner import clean_text
from network.http_client import fetch_url_with_final

# Careers URLs already pointing straight at one of these ATS platforms are
# treated as the listing page itself - no further link-hopping is attempted.
DIRECT_ATS_DOMAINS = [
    "myworkdayjobs.com",
    "candidatemanager.net",
    "bamboohr.com",
    "rezoomo.com",
    "apply.workable.com",
    "jobs.lidl.ie",
    "seeMoreJobPostings",
    "icims.com",
    "talent-soft.com",
    "eightfold.ai",
    "pageuppeople.com",
    "careers.tesco.com",
    "metacareers.com",
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "boards-api.greenhouse.io",
    "jobs.ashbyhq.com",
    "jobs.lever.co",
    "careers.smartrecruiters.com",
    "amazon.jobs",
    "avature.net",
]

AUTH_WALL_PATTERN = re.compile(r"(login|signin|sign-in|/sso/|oauth2/authorize|microsoftonline\.com)", re.I)


def is_auth_wall(url: str) -> bool:
    """Return True if a resolved URL looks like a login/SSO wall rather than a listing page."""
    return bool(AUTH_WALL_PATTERN.search(url))


def candidate_manager_listing_url(url: str) -> str:
    """Turn a CandidateManager detail link into its stable vacancies board."""
    parsed = urllib.parse.urlparse(url)
    if "candidatemanager.net" not in parsed.netloc.lower() or "pjobdetails.aspx" not in parsed.path.lower():
        return url
    query = urllib.parse.parse_qs(parsed.query)
    mid = query.get("mid", [""])[0]
    sid = query.get("sid", [""])[0]
    if not mid or not sid:
        return url
    return (
        f"{parsed.scheme}://{parsed.netloc}/cm/p/pJobs.aspx?mid={urllib.parse.quote(mid)}&sid={urllib.parse.quote(sid)}"
    )


def _candidate_manager_listing_page(url: str, page_html: str) -> tuple[str, str]:
    """Fetch the board if discovery accidentally selected one current vacancy."""
    listing_url = candidate_manager_listing_url(url)
    if listing_url == url:
        return url, page_html
    try:
        return fetch_url_with_final(listing_url, timeout=10)
    except Exception:
        return listing_url, page_html


def discover_employer_careers(name: str, start_url: str) -> tuple[str, str]:
    """
    Crawls an employer's website to discover where its careers and job listings are located.
    1. Tests start_url.
    2. If start_url fails (404, broken, redirect), falls back to the company homepage
       and searches for 'Careers', 'Jobs', 'Vacancies', 'Work with us', etc.
    3. On the careers page, looks for deeper job listings or ATS portals
       (Workday, CoreHR, CandidateManager, SuccessFactors, Taleo, Greenhouse, /jobs, etc.).
    Returns (listing_url, page_html).
    """
    target_url = start_url
    page_html = ""
    start_err: Exception | None = None
    try:
        target_url, page_html = fetch_url_with_final(start_url, timeout=10)
    except Exception as e:
        start_err = e
        # Fall back to root company domain
        p = urllib.parse.urlparse(start_url)
        root = f"{p.scheme}://{p.netloc}"
        try:
            root_final, root_html = fetch_url_with_final(root, timeout=10)
            links = re.findall(
                r"<a\s+[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>",
                root_html,
                re.I | re.DOTALL,
            )
            best_link = ""
            for h, t in links:
                ct = clean_text(t).lower()
                ch = h.strip().lower()
                if any(
                    k in ct
                    for k in [
                        "current vacancies",
                        "vacancies",
                        "careers",
                        "jobs",
                        "work with us",
                        "join us",
                        "working at",
                        "recruitment",
                        "opportúntais",
                    ]
                ) or any(k in ch for k in ["/careers", "/jobs", "/vacancies", "/careers-", "/work-with-us"]):
                    if not any(skip in ct for skip in ["early career", "student", "fellowship"]):
                        best_link = urljoin(root_final, h.strip())
                        break
            if best_link:
                try:
                    target_url, page_html = fetch_url_with_final(best_link, timeout=10)
                except Exception:
                    target_url, page_html = root_final, root_html
            else:
                target_url, page_html = root_final, root_html
        except Exception as e2:
            raise (start_err or e2) from e2

    if any(d.lower() in start_url.lower() for d in DIRECT_ATS_DOMAINS):
        # start_url points directly at an ATS platform - retain start_url even if
        # HTTP redirects took us to a vanity brand page that stripped the token.
        return _candidate_manager_listing_page(start_url, page_html)

    if any(d.lower() in target_url.lower() for d in DIRECT_ATS_DOMAINS):
        return _candidate_manager_listing_page(target_url, page_html)

    if page_html:
        links = re.findall(
            r"<a\s+[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>",
            page_html,
            re.I | re.DOTALL,
        )
        candidates: list[tuple[int, str]] = []
        for h, t in links:
            ct = clean_text(t).lower()
            full = urljoin(target_url, html.unescape(h.strip()))
            if any(
                skip in full.lower() or skip in ct
                for skip in [
                    "login",
                    "log in",
                    "sign in",
                    "signin",
                    "subscribe",
                    "talentcommunity",
                    "my_profile",
                    "register",
                    "forgotpassword",
                    "privacy",
                    "cookie",
                    "terms",
                    "javascript:void",
                ]
            ):
                continue

            score = 0
            if any(
                kw in ct
                for kw in [
                    "open vacancies",
                    "all open vacancies",
                    "current vacancies",
                    "current job opportunities",
                    "search jobs",
                    "search all jobs",
                    "view jobs",
                    "view our current vacancies",
                    "open positions",
                    "view vacancies",
                    "all vacancies",
                    "explore opportunities",
                ]
            ):
                score += 15
            if any(
                kw in full.lower()
                for kw in ["searchalljobs", "all-jobs", "pjobs.aspx", "/jobs", "/vacancies", "/current-vacancies"]
            ):
                score += 10
            if any(
                ats in full.lower()
                for ats in [
                    "myworkdayjobs.com",
                    "corehr.com",
                    "careers.esb.ie",
                    "candidatemanager.net",
                    "successfactors",
                    "greenhouse.io",
                    "lever.co",
                    "tal.net",
                    "smartrecruiters.com",
                    "workable.com",
                    "jobvite.com",
                    "ashbyhq.com",
                ]
            ):
                score += 8

            if score > 0:
                candidates.append((score, full))

        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            best_url = candidates[0][1]
            if "myworkdayjobs.com" in best_url:
                return best_url, page_html
            try:
                deeper_url, deeper_html = fetch_url_with_final(best_url, timeout=8)
                target_url, page_html = deeper_url, deeper_html
                # Check if deeper page links to external ATS portal
                deeper_links = re.findall(
                    r"<a\s+[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>",
                    deeper_html,
                    re.I | re.DOTALL,
                )
                for dh, dt in deeper_links:
                    dct = clean_text(dt).lower()
                    dfull = urljoin(deeper_url, html.unescape(dh.strip()))
                    if any(skip in dfull.lower() or skip in dct for skip in ["login", "sign in", "subscribe"]):
                        continue
                    if any(
                        ats in dfull.lower()
                        for ats in [
                            "myworkdayjobs.com",
                            "corehr.com",
                            "careers.esb.ie",
                            "candidatemanager.net",
                            "successfactors",
                            "greenhouse.io",
                            "lever.co",
                            "tal.net",
                            "smartrecruiters.com",
                        ]
                    ):
                        if "myworkdayjobs.com" in dfull:
                            return dfull, deeper_html
                        try:
                            target_url, page_html = fetch_url_with_final(dfull, timeout=8)
                        except Exception:
                            target_url = dfull
                        break
            except Exception:
                target_url = best_url

    return _candidate_manager_listing_page(target_url, page_html)
