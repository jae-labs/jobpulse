"""ATS Sniffer and Auto-Resolver.

Scans configured websites in config/websites.yaml with generic or marketing URLs,
sniffs underlying ATS platforms (Greenhouse, Ashby, Lever, SmartRecruiters,
Workable, BambooHR, Personio, Teamtailor, Workday), tests detected board endpoints,
and optionally promotes them directly into config/websites.yaml.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import yaml

SCRAPER_ROOT = Path(__file__).resolve().parent.parent
if str(SCRAPER_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRAPER_ROOT))

from config import load_websites_config, validate_websites_config  # noqa: E402
from network.http_client import fetch_url_with_final  # noqa: E402
from scrapers.generic.listing import extract_jobs_from_listing  # noqa: E402

ATS_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    # (Provider Name, Pattern, URL Template)
    (
        "Greenhouse",
        re.compile(
            r"https?://(?:boards|job-boards)\.greenhouse\.io/(?:embed/job_board/js\?for=)?([a-zA-Z0-9_\-]+)",
            re.I,
        ),
        "https://boards.greenhouse.io/{token}",
    ),
    (
        "Greenhouse",
        re.compile(r"boards\.greenhouse\.io/embed/job_board/js\?for=([a-zA-Z0-9_\-]+)", re.I),
        "https://boards.greenhouse.io/{token}",
    ),
    (
        "Lever",
        re.compile(r"https?://jobs\.lever\.co/([a-zA-Z0-9_\-]+)", re.I),
        "https://jobs.lever.co/{token}",
    ),
    (
        "Ashby",
        re.compile(r"https?://jobs\.ashbyhq\.com/([a-zA-Z0-9_\-]+)", re.I),
        "https://jobs.ashbyhq.com/{token}",
    ),
    (
        "SmartRecruiters",
        re.compile(r"https?://careers\.smartrecruiters\.com/([a-zA-Z0-9_\-]+)", re.I),
        "https://careers.smartrecruiters.com/{token}",
    ),
    (
        "Workable",
        re.compile(r"https?://apply\.workable\.com/([a-zA-Z0-9_\-]+)", re.I),
        "https://apply.workable.com/{token}",
    ),
    (
        "BambooHR",
        re.compile(r"https?://([a-zA-Z0-9_\-]+)\.bamboohr\.com/jobs", re.I),
        "https://{token}.bamboohr.com/jobs",
    ),
    (
        "Personio",
        re.compile(r"https?://([a-zA-Z0-9_\-]+)\.jobs\.personio\.(?:de|com)", re.I),
        "https://{token}.jobs.personio.de",
    ),
    (
        "Teamtailor",
        re.compile(r"https?://([a-zA-Z0-9_\-]+)\.teamtailor\.com", re.I),
        "https://{token}.teamtailor.com/jobs",
    ),
    (
        "Workday",
        re.compile(r"https?://[a-zA-Z0-9_\-\.]+\.myworkdayjobs\.com/[^\s\"\'<>]+", re.I),
        "{token}",  # Full URL
    ),
]

KNOWN_ATS_DOMAINS = [
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "jobs.lever.co",
    "jobs.ashbyhq.com",
    "careers.smartrecruiters.com",
    "apply.workable.com",
    "bamboohr.com",
    "jobs.personio.de",
    "jobs.personio.com",
    "teamtailor.com",
    "myworkdayjobs.com",
]


def clean_workday_url(url: str) -> str:
    """Normalize Workday URL to base board path (e.g. https://company.wd3.myworkdayjobs.com/tenant)."""
    m = re.match(
        r"(https?://[a-zA-Z0-9_\-\.]+\.myworkdayjobs\.com)/(?:en-[A-Za-z]{2}/)?([a-zA-Z0-9_\-]+)",
        url,
        re.I,
    )
    if m:
        base_origin = m.group(1)
        tenant = m.group(2)
        if tenant.lower() not in {"job", "apply", "login", "introduceyourself"}:
            return f"{base_origin}/{tenant}"
    return url.split("?")[0].split("#")[0]


def sniff_ats_from_url_and_html(final_url: str, page_html: str) -> tuple[str, str] | None:
    """Detect if the page or its redirected URL points to or embeds an ATS board."""
    # 1. Check final redirected URL
    for provider, pattern, tmpl in ATS_PATTERNS:
        m = pattern.search(final_url)
        if m:
            token = clean_workday_url(m.group(0)) if provider == "Workday" else m.group(1)
            token = token.strip("/?#")
            if token and token.lower() not in {"embed", "js", "api"}:
                return provider, token if provider == "Workday" else tmpl.format(token=token)

    if not page_html:
        return None

    # 2. Check iframes and script tags
    iframe_matches = re.findall(r"<iframe[^>]*\ssrc=[\"']([^\"']+)[\"']", page_html, re.I)
    script_matches = re.findall(r"<script[^>]*\ssrc=[\"']([^\"']+)[\"']", page_html, re.I)
    candidate_urls = iframe_matches + script_matches

    for cand in candidate_urls:
        for provider, pattern, tmpl in ATS_PATTERNS:
            m = pattern.search(cand)
            if m:
                token = clean_workday_url(m.group(0)) if provider == "Workday" else m.group(1)
                token = token.strip("/?#")
                if token and token.lower() not in {"embed", "js", "api"}:
                    return provider, token if provider == "Workday" else tmpl.format(token=token)

    # 3. Check outgoing anchor links
    anchor_matches = re.findall(r"<a[^>]*\shref=[\"']([^\"']+)[\"']", page_html, re.I)
    for href in anchor_matches:
        full_href = urljoin(final_url, html.unescape(href.strip()))
        for provider, pattern, tmpl in ATS_PATTERNS:
            m = pattern.search(full_href)
            if m:
                token = clean_workday_url(m.group(0)) if provider == "Workday" else m.group(1)
                token = token.strip("/?#")
                if token and token.lower() not in {"embed", "js", "api"}:
                    return provider, token if provider == "Workday" else tmpl.format(token=token)

    return None


def sniff_employer(site: dict[str, Any], timeout: int = 10) -> dict[str, Any] | None:
    """Fetch website careers URL and sniff for ATS patterns."""
    name = site.get("name", "Unknown")
    orig_url = site.get("careers_url", "")
    if not orig_url:
        return None

    try:
        final_url, page_html = fetch_url_with_final(orig_url, timeout=timeout)
    except Exception:
        return None

    detected = sniff_ats_from_url_and_html(final_url, page_html)

    # 4. If not found on landing page, inspect sample job detail links
    if not detected and page_html:
        anchor_matches = re.findall(r"<a[^>]*\shref=[\"']([^\"'#]+)[\"']", page_html, re.I)
        detail_candidates: list[str] = []
        for href in anchor_matches:
            clean_href = html.unescape(href.strip())
            full_href = urljoin(final_url, clean_href)
            if re.search(r"/(?:position[s]?|job[s]?|role[s]?|vacancy|vacancies)/[a-zA-Z0-9_\-]+", clean_href, re.I):
                detail_candidates.append(full_href)

        for detail_url in detail_candidates[:3]:
            try:
                d_final, d_html = fetch_url_with_final(detail_url, timeout=timeout)
                detected = sniff_ats_from_url_and_html(d_final, d_html)
                if detected:
                    break
            except Exception:
                continue

    if not detected:
        return None

    provider, ats_url = detected
    if ats_url.lower() == orig_url.lower():
        return None

    # Test the detected board
    try:
        opps = extract_jobs_from_listing(name, ats_url, "")
        job_count = len(opps)
    except Exception:
        job_count = 0

    return {
        "name": name,
        "sector": site.get("sector", "Technology"),
        "priority": site.get("priority", 85),
        "original_url": orig_url,
        "final_url": final_url,
        "provider": provider,
        "ats_url": ats_url,
        "job_count": job_count,
    }


def scan_and_resolve(
    websites_path: Path,
    limit: int | None = None,
    filter_name: str | None = None,
    apply: bool = False,
    workers: int = 10,
) -> list[dict[str, Any]]:
    """Scan candidate websites and optionally apply resolved ATS URLs."""
    all_sites = load_websites_config()
    print(f"Loaded {len(all_sites)} total configured websites.")

    # Target sites that are watchlist or generic_crawler and not already direct ATS
    candidates: list[dict[str, Any]] = []
    for s in all_sites:
        name = s.get("name", "")
        url = s.get("careers_url", "").lower()
        if filter_name and filter_name.lower() not in name.lower():
            continue
        if any(dom in url for dom in KNOWN_ATS_DOMAINS):
            continue
        # Skip custom core scrapers that have their own bespoke parsing
        if s.get("scraper_type") == "core" and s.get("scraper") not in {"generic_crawler", None}:
            continue
        candidates.append(s)

    if limit:
        candidates = candidates[:limit]

    print(f"Scanning {len(candidates)} candidate websites for underlying ATS platforms (workers={workers})...")
    print("-" * 80)

    resolved: list[dict[str, Any]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(sniff_employer, s): s for s in candidates}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res:
                resolved.append(res)
                print(
                    f"  [SNIFFED] {res['name']:<24} -> {res['provider']:<14} ({res['job_count']} jobs) {res['ats_url']}"
                )

    print("-" * 80)
    print(f"Scan complete: detected {len(resolved)} ATS boards across {len(candidates)} candidates.")

    if apply and resolved:
        resolved_map = {r["name"].strip().lower(): r["ats_url"] for r in resolved if r.get("job_count", 0) > 0}
        updated_count = 0
        with websites_path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        websites_list = data.get("websites", [])
        for entry in websites_list:
            n = entry.get("name", "").strip().lower()
            if n in resolved_map:
                new_url = resolved_map[n]
                if entry.get("careers_url") != new_url:
                    entry["careers_url"] = new_url
                    updated_count += 1

        with websites_path.open("w", encoding="utf-8") as f:
            yaml.dump(data, f, sort_keys=False, allow_unicode=True, width=120)

        issues = validate_websites_config(load_websites_config())
        if issues:
            print(f"ERROR: config validation found issues: {issues}")
        else:
            print(f"SUCCESS: Successfully updated {updated_count} entries in {websites_path.name}!")

    return resolved


def main() -> None:
    parser = argparse.ArgumentParser(description="Sniff and resolve direct ATS boards for websites.yaml")
    parser.add_argument(
        "--config",
        type=Path,
        default=SCRAPER_ROOT / "config" / "websites.yaml",
        help="Path to websites.yaml",
    )
    parser.add_argument("--limit", type=int, default=None, help="Limit number of websites to scan")
    parser.add_argument("--filter", type=str, default=None, help="Filter candidate websites by name substring")
    parser.add_argument("--workers", type=int, default=10, help="Number of concurrent worker threads (default: 10)")
    parser.add_argument("--apply", action="store_true", help="Apply resolved ATS URLs directly to websites.yaml")
    args = parser.parse_args()

    scan_and_resolve(
        websites_path=args.config,
        limit=args.limit,
        filter_name=args.filter,
        apply=args.apply,
        workers=args.workers,
    )


if __name__ == "__main__":
    main()
