"""Harvest ATS boards by detecting the careers page behind a company website.

Independent of any third-party catalogue: it reads the employers we already track,
tries their careers URL and common careers paths, detects the embedded ATS (URL
redirect or page markers), and adds the board as ``pending``. Preview by default.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html as html_lib
import json
import re
import sys
import threading
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.config.boards import board_url, detect_provider  # noqa: E402
from jobpulse_scraper.database.client import get_supabase  # noqa: E402
from jobpulse_scraper.database.records import select_all_records  # noqa: E402
from jobpulse_scraper.network.http_client import fetch_url_with_final  # noqa: E402
from tools.sniff_ats import sniff_ats_from_url_and_html  # noqa: E402

CAREERS_PATHS = ("/careers", "/jobs", "/careers/", "/about/careers", "/company/careers", "/en/careers")
_JOB_DETAIL_HOSTS = ("jobsireland.ie", "indeed.", "linkedin.com/jobs")

# Vendors whose board is the careers host itself; matched against embedded resource
# URLs (scripts/iframes/anchors) and the host, never free page text.
_HOST_MARKERS: tuple[tuple[str, str], ...] = (
    ("icims.com", "icims"),
    ("phenompeople", "phenom"),
    ("phenom.cloud", "phenom"),
    ("talentbrew", "radancy"),
    ("radancy.com", "radancy"),
    ("avature.net", "avature"),
    ("jobvite.com", "jobvite"),
    ("successfactors", "successfactors"),
    ("sapsf.com", "successfactors"),
)
_EMBEDDED = re.compile(r'<(?:iframe|script|a)[^>]*\s(?:src|href)=["\']([^"\']+)["\']', re.I)

# Real ATS hosts. `detect_provider` also recognises broad patterns (linkedin, amazon,
# musgrave) that appear as ordinary links on nearly every careers page, so an embedded
# or final URL is only trusted when its host is one of these.
_ATS_HOSTS = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "smartrecruiters.com",
    "workable.com",
    "bamboohr.com",
    "personio.de",
    "personio.com",
    "teamtailor.com",
    "recruitee.com",
    "myworkdayjobs.com",
    "myworkdaysite.com",
    "icims.com",
    "eightfold.ai",
    "oraclecloud.com",
    "taleo.net",
    "jobvite.com",
    "avature.net",
    "zohorecruit.",
    "breezy.hr",
    "pinpointhq.com",
    "rippling.com",
    "ultipro.com",
    "ukg.net",
    "dayforcehcm.com",
    "careers-page.com",
    "phenompeople.com",
    "successfactors",
    "talentbrew",
    "radancy.com",
    "jobs2web",
    "recruiterbox.com",
    "hibob.com",
)


def _is_ats_host(url: str) -> bool:
    host = urlsplit(url).netloc.lower()
    return any(marker in host for marker in _ATS_HOSTS)


def _candidate_urls(website: str, careers_url: str) -> list[str]:
    urls: list[str] = []
    careers = (careers_url or "").strip()
    if careers and not any(host in careers.lower() for host in _JOB_DETAIL_HOSTS):
        urls.append(careers)
    site = (website or "").strip().rstrip("/")
    if site:
        urls.append(site)
        urls.extend(f"{site}{path}" for path in CAREERS_PATHS)
    seen: set[str] = set()
    ordered: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


def _detect_from_page(final_url: str, page: str) -> tuple[str, str] | None:
    """Resolve a board from a careers page: URL, embedded ATS links, or host markers."""
    if _is_ats_host(final_url):
        provider, board = detect_provider(final_url)
        if provider != "generic" and board:
            return provider, board

    host = urlsplit(final_url).netloc.lower()
    embedded = [final_url]
    for match in _EMBEDDED.finditer(page):
        embedded.append(urljoin(final_url, html_lib.unescape(match.group(1))))
    for candidate in embedded:
        if not _is_ats_host(candidate):
            continue
        provider, board = detect_provider(candidate)
        if provider != "generic" and board:
            return provider, board

    sniffed = sniff_ats_from_url_and_html(final_url, page)
    if sniffed:
        provider, board = detect_provider(sniffed[1])
        if provider != "generic" and board:
            return provider, board

    if host:
        for marker, marker_provider in _HOST_MARKERS:
            if any(marker in candidate.lower() for candidate in embedded) or marker in host:
                return marker_provider, host
    return None


def detect_board(url: str, *, allow_browser: bool = True) -> tuple[str, str] | None:
    """Return ``(provider, board)`` for a careers page, with a JS-rendered fallback."""
    try:
        final_url, page = fetch_url_with_final(url, timeout=15)
    except Exception:
        final_url, page = url, ""
    result = _detect_from_page(final_url, page)
    if result:
        return result
    if not allow_browser:
        return None
    # A JS-rendered careers page (React/Vue shell) exposes the ATS only after render.
    try:
        from jobpulse_scraper.network.browser import fetch_via_browser  # noqa: PLC0415

        browser_url, browser_html = fetch_via_browser(final_url or url, wait_for_idle=True)
        if browser_html:
            return _detect_from_page(browser_url, browser_html)
    except Exception:
        pass
    return None


def _load_company_seeds(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    import yaml  # noqa: PLC0415

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return data.get("companies", []) or []


def _probe_candidate(
    candidate: dict[str, Any],
    use_browser: bool,
    browser_sem: threading.BoundedSemaphore,
) -> tuple[dict[str, Any], tuple[str, str] | None, str]:
    """Probe one company's candidate URLs; the browser fallback is concurrency-bounded."""
    for index, url in enumerate(_candidate_urls(candidate["website"], candidate["careers_url"])[:6]):
        if use_browser and index == 0:
            with browser_sem:
                detected = detect_board(url, allow_browser=True)
        else:
            detected = detect_board(url, allow_browser=False)
        if detected:
            return candidate, detected, url
    return candidate, None, ""


def _select_all(client: Any, table: str, columns: str) -> list[dict[str, Any]]:
    return select_all_records(lambda: client.table(table).select(columns).order("id"))


def harvest_ats(
    *,
    limit: int = 100,
    apply: bool = False,
    use_browser: bool = True,
    companies: list[dict[str, Any]] | None = None,
    workers: int = 8,
    browser_workers: int = 3,
) -> dict[str, int]:
    client = get_supabase()
    employers = _select_all(client, "employers", "id,name,website,careers_url")
    boards = _select_all(client, "boards", "provider,board,employer_id")
    linked = {row["employer_id"] for row in boards if row.get("employer_id")}
    known = {(row["provider"], row["board"].lower()) for row in boards}

    employer_candidates: list[dict[str, Any]] = [
        {
            "name": e["name"],
            "website": e.get("website") or "",
            "careers_url": e.get("careers_url") or "",
            "employer_id": e["id"],
        }
        for e in employers
        if e["id"] not in linked and (str(e.get("website") or "").strip() or str(e.get("careers_url") or "").strip())
    ]
    seed_candidates: list[dict[str, Any]] = [
        {
            "name": str(company.get("name") or "").strip(),
            "website": str(company.get("website") or ""),
            "careers_url": str(company.get("careers_url") or ""),
            "employer_id": None,
        }
        for company in (companies or [])
        if str(company.get("name") or "").strip()
    ]
    # Company seeds first: they are curated and higher-yield than the job-detail URLs
    # most unlinked employers carry, so value arrives early in a long run.
    candidates = (seed_candidates + employer_candidates)[:limit]

    counts = {"candidates": 0, "insertable": 0, "inserted": 0}
    browser_sem = threading.BoundedSemaphore(max(1, browser_workers))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(_probe_candidate, candidate, use_browser, browser_sem) for candidate in candidates]
        for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
            counts["candidates"] = done
            candidate, detected, url = future.result()
            if detected:
                provider, board = detected
                key = (provider, board.lower())
                if key not in known:
                    known.add(key)
                    counts["insertable"] += 1
                    # Insert as each board is found: a long run must not lose its work if interrupted.
                    if apply:
                        try:
                            client.table("boards").insert(
                                [
                                    {
                                        "provider": provider,
                                        "board": board,
                                        "region": "",
                                        "company": candidate["name"],
                                        "careers_url": board_url(provider, board) or url,
                                        "sector": "General",
                                        "priority": 40,
                                        "enabled": True,
                                        "status": "pending",
                                        "discovery_source": "harvest-ats",
                                        "metadata": {"employer_id": candidate["employer_id"], "careers_page": url},
                                    }
                                ]
                            ).execute()
                            counts["inserted"] += 1
                        except Exception:
                            counts["insertable"] -= 1
            if done % 20 == 0:
                print(
                    f"[HARVEST] {done}/{len(candidates)} probed, {counts['inserted']} boards added",
                    flush=True,
                )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100, help="Employers to probe")
    parser.add_argument("--apply", action="store_true", help="Insert detected boards as pending")
    parser.add_argument("--no-browser", action="store_true", help="Skip the Playwright fallback (faster, lower yield)")
    parser.add_argument("--companies", type=Path, default=None, help="YAML/JSON company seed list ({name,website})")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent company probes (1-32)")
    parser.add_argument("--browser-workers", type=int, default=3, help="Concurrent Playwright fallbacks (1-8)")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    if not 1 <= args.workers <= 32 or not 1 <= args.browser_workers <= 8:
        parser.error("workers must be 1-32; browser-workers must be 1-8")
    counts = harvest_ats(
        limit=args.limit,
        apply=args.apply,
        use_browser=not args.no_browser,
        companies=_load_company_seeds(args.companies),
        workers=args.workers,
        browser_workers=args.browser_workers,
    )
    print(json.dumps({**counts, "applied": args.apply}, indent=2))
    if not args.apply:
        print("Dry run. Re-run with --apply to persist detected boards.")


if __name__ == "__main__":
    main()
