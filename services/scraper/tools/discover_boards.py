"""Discover new ATS boards from Common Crawl and add verified Irish boards.

Read-only against the catalog until ``--apply``. A candidate is added only when its
board answers with at least one explicitly Irish posting, so discovery grows the
catalog with boards that are relevant to Ireland rather than every global board.

Usage:
  uv run --locked python tools/discover_boards.py --provider greenhouse --limit 50
  uv run --locked python tools/discover_boards.py --provider all --limit 40 --apply
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.config.boards import board_url, detect_provider  # noqa: E402
from jobpulse_scraper.engine.text_cleaner import clean_text  # noqa: E402
from jobpulse_scraper.network.http_client import fetch_url_with_final  # noqa: E402
from jobpulse_scraper.scrapers.generic.listing import extract_jobs_from_listing  # noqa: E402
from jobpulse_scraper.scrapers.providers.location import is_explicit_ireland_location  # noqa: E402

CDX_BASE = "https://index.commoncrawl.org"
LIVE_STATUSES = ["pending", "active"]


def _path_board(url: str, host: str) -> str | None:
    """First path segment of a path-based board URL."""
    parsed = urlsplit(url)
    if host not in parsed.netloc.lower():
        return None
    segments = [segment for segment in parsed.path.split("/") if segment]
    if not segments:
        return None
    board = segments[0].strip()
    if not board or board.lower() in _JUNK_BOARDS:
        return None
    return board


_JUNK_BOARDS = {"jobs", "job", "careers", "career", "embed", "api", "j", "view", "apply", "job-board", "job-boards"}

# Providers whose board is a token/subdomain and therefore reliably recoverable
# from a posting URL (unlike host+path providers such as Amazon or Rezoomo).
TOKEN_PROVIDERS = {
    "greenhouse",
    "lever",
    "ashby",
    "smartrecruiters",
    "workable",
    "bamboohr",
    "personio",
    "teamtailor",
    "recruitee",
    "breezy",
    "pinpoint",
    "rippling",
    "ukg",
    "icims",
    "eightfold",
    "zohorecruit",
    "manatal",
    "phenom",
    "workday",
}


def _workday_board(url: str) -> str | None:
    """Workday board is ``<host>/<site>``, skipping a leading ``xx-XX`` locale."""
    parsed = urlsplit(url)
    if "myworkdayjobs.com" not in parsed.netloc.lower():
        return None
    segments = [segment for segment in parsed.path.split("/") if segment]
    if not segments:
        return None
    site = segments[1] if re.fullmatch(r"[a-z]{2}-[A-Z]{2}", segments[0]) and len(segments) > 1 else segments[0]
    if not site or site.lower() in {"job", "jobs", "robots.txt", "apply", "login"}:
        return None
    return f"{parsed.netloc.lower()}/{site}"


def _subdomain_board(url: str, apex: str) -> str | None:
    """Leftmost DNS label for a subdomain-boarded provider."""
    host = urlsplit(url).netloc.lower()
    if not host.endswith(f".{apex}"):
        return None
    label = host[: -len(f".{apex}")].split(".")[-1]
    return label if label and label.lower() not in _JUNK_BOARDS else None


PROVIDERS: dict[str, dict[str, Any]] = {
    "greenhouse": {
        "pattern": "job-boards.greenhouse.io/*",
        "domain": False,
        "extract": lambda url: _path_board(url, "greenhouse.io"),
        "board_url": lambda board: f"https://job-boards.greenhouse.io/{board}",
    },
    "ashby": {
        "pattern": "jobs.ashbyhq.com/*",
        "domain": False,
        "extract": lambda url: _path_board(url, "ashbyhq.com"),
        "board_url": lambda board: f"https://jobs.ashbyhq.com/{board}",
    },
    "lever": {
        "pattern": "jobs.lever.co/*",
        "domain": False,
        "extract": lambda url: _path_board(url, "lever.co"),
        "board_url": lambda board: f"https://jobs.lever.co/{board}",
    },
    "workable": {
        "pattern": "apply.workable.com/*",
        "domain": False,
        "extract": lambda url: _path_board(url, "workable.com"),
        "board_url": lambda board: f"https://apply.workable.com/{board}",
    },
    "smartrecruiters": {
        "pattern": "jobs.smartrecruiters.com/*",
        "domain": False,
        "extract": lambda url: _path_board(url, "smartrecruiters.com"),
        "board_url": lambda board: f"https://jobs.smartrecruiters.com/{board}",
    },
    "bamboohr": {
        "pattern": "bamboohr.com",
        "domain": True,
        "extract": lambda url: _subdomain_board(url, "bamboohr.com"),
        "board_url": lambda board: f"https://{board}.bamboohr.com/jobs",
    },
    "oracle": {
        "pattern": "oraclecloud.com",
        "domain": True,
        "extract": lambda url: urlsplit(url).netloc.lower() or None,
        "board_url": lambda board: f"https://{board}",
    },
    "workday": {
        "pattern": "myworkdayjobs.com",
        "domain": True,
        "extract": _workday_board,
        "board_url": lambda board: f"https://{board}",
    },
}


def latest_crawl_indexes(count: int = 3) -> list[str]:
    """Newest Common Crawl index ids, newest first."""
    try:
        _, body = fetch_url_with_final(f"{CDX_BASE}/collinfo.json", timeout=30)
        crawls = json.loads(body)
    except Exception:
        return []
    return [str(c["id"]) for c in crawls[:count] if c.get("id")]


def cdx_urls(crawl_id: str, pattern: str, *, domain: bool, limit: int) -> list[str]:
    """Query one Common Crawl index for URLs matching a pattern."""
    query = f"url={quote(pattern, safe='')}"
    if domain:
        query += "&matchType=domain"
    url = f"{CDX_BASE}/{crawl_id}-index?{query}&output=json&fl=url&limit={limit}&collapse=urlkey"
    try:
        _, body = fetch_url_with_final(url, timeout=60)
    except Exception:
        return []
    urls: list[str] = []
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            urls.append(str(json.loads(line)["url"]))
        except (json.JSONDecodeError, KeyError):
            continue
    return urls


def candidate_boards(provider: str, urls: list[str]) -> dict[str, str]:
    """Collapse raw crawl URLs into ``board -> board_url`` candidates."""
    spec = PROVIDERS[provider]
    extract: Callable[[str], str | None] = spec["extract"]
    found: dict[str, str] = {}
    for url in urls:
        board = extract(url)
        if board:
            found.setdefault(board, spec["board_url"](board))
    return found


def _slug_name(board: str) -> str:
    return re.sub(r"[-_]+", " ", board).strip().title() or board


def resolve_company_name(provider: str, board: str, board_url: str) -> str:
    """Best-effort display name: Greenhouse API name, else the board page title."""
    if provider == "greenhouse":
        try:
            _, body = fetch_url_with_final(f"https://boards-api.greenhouse.io/v1/boards/{board}", timeout=15)
            name = str(json.loads(body).get("name") or "").strip()
            if name:
                return name
        except Exception:
            pass
    try:
        _, html = fetch_url_with_final(board_url, timeout=15)
        match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.DOTALL)
        if match:
            title = clean_text(match.group(1))
            title = re.split(r"\s+[|\-–—]\s+", title)[0].strip()
            title = re.sub(r"\b(careers?|jobs?|job board|opportunities|open roles?)\b", "", title, flags=re.I).strip(
                " -|"
            )
            if 2 <= len(title) <= 120:
                return title
    except Exception:
        pass
    return _slug_name(board)


def probe_irish(provider: str, board: str, board_url: str, company: str) -> int:
    """Return the count of explicitly Irish postings a board answers with."""
    try:
        opportunities = extract_jobs_from_listing(company, board_url, "", provider)
    except Exception:
        return 0
    return sum(1 for o in opportunities if is_explicit_ireland_location(o.get("location", "")))


def _live_boards() -> set[tuple[str, str]]:
    """Existing live board identities as ``(provider, lower(board))``."""
    try:
        from jobpulse_scraper.config.boards import load_board_config  # noqa: PLC0415

        return {(entry["provider"], entry["board"].lower()) for entry in load_board_config()}
    except Exception:
        return set()


def _insert_boards(client: Any, payloads: list[dict[str, Any]]) -> int:
    for start in range(0, len(payloads), 500):
        client.table("boards").insert(payloads[start : start + 500]).execute()
    return len(payloads)


def _candidate_payload(
    provider: str, board: str, company: str, source: str, evidence: dict[str, Any]
) -> dict[str, Any] | None:
    url = board_url(provider, board)
    if not url:
        return None
    return {
        "provider": provider,
        "board": board,
        "region": "",
        "company": company or _slug_name(board),
        "careers_url": url,
        "sector": "General",
        "priority": 40,
        "enabled": True,
        "status": "pending",
        "discovery_source": source,
        "metadata": evidence,
    }


def _board_from_external_id(source: str | None, external_id: str) -> str | None:
    """Recover a board from a provider-namespaced ``<board>:<id>`` external id.

    Freehire stores the board identity even when the posting URL hides the ATS
    behind a vanity domain (``www.vectra.ai`` for Greenhouse ``vectranetworks``).
    """
    if source not in TOKEN_PROVIDERS or ":" not in external_id:
        return None
    prefix = external_id.split(":", 1)[0].strip()
    if not prefix or re.fullmatch(r"[0-9a-f]{16,}|[0-9]+", prefix, re.I):
        return None
    if source == "teamtailor":
        # Teamtailor external ids carry the full host; the board is the tenant label.
        return prefix[: -len(".teamtailor.com")] if prefix.endswith(".teamtailor.com") else None
    if source == "workday":
        if "." in prefix and "/" in prefix and prefix.rsplit("/", 1)[-1].lower() not in _JUNK_BOARDS:
            return prefix
        return None
    return prefix if re.fullmatch(r"[A-Za-z0-9._-]{1,120}", prefix) else None


def _group_token_boards(records: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    """Group posting records into token-based boards, ignoring generic path noise."""
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        source = record.get("source")
        board = _board_from_external_id(source, str(record.get("external_id") or ""))
        if board and source is not None:
            provider = source
        else:
            provider, board = detect_provider(record.get("url", ""))
        if provider not in TOKEN_PROVIDERS or not board or board.lower() in _JUNK_BOARDS:
            continue
        key = (provider, board.lower())
        entry = grouped.setdefault(key, {"provider": provider, "board": board, "companies": Counter(), "count": 0})
        entry["count"] += 1
        if record.get("company"):
            entry["companies"][str(record["company"]).strip()] += 1
    return grouped


def _freehire_ie_jobs(max_pages: int = 100) -> list[dict[str, Any]]:
    """Read a public Ireland catalogue for board identities (optional, no auth).

    Override the endpoint with ``FREEHIRE_API_URL`` or leave it unset. This is a
    discovery *input only*; nothing in the scrape pipeline calls it.
    """
    base = os.environ.get("FREEHIRE_API_URL", "https://freehire.me/api/v1").rstrip("/")
    jobs: list[dict[str, Any]] = []
    offset = 0
    for _ in range(max_pages):
        url = f"{base}/jobs/search?countries=IE&limit=100&offset={offset}"
        try:
            _, body = fetch_url_with_final(url, timeout=30)
            payload = json.loads(body)
        except Exception:
            break
        data = payload.get("data", [])
        if not data:
            break
        jobs.extend(data)
        offset += len(data)
        total = payload.get("meta", {}).get("total", 0)
        if offset >= total or offset >= 10000:
            break
    return jobs


def discover_from_records(
    records: list[dict[str, Any]],
    *,
    source: str,
    known: set[tuple[str, str]],
    limit: int | None = None,
    apply: bool = False,
    client: Any | None = None,
) -> dict[str, int]:
    """Add token-based boards found in posting records to the catalog as pending."""
    grouped = _group_token_boards(records)
    candidates = [entry for key, entry in grouped.items() if key not in known]
    candidates.sort(key=lambda entry: -entry["count"])
    if limit:
        candidates = candidates[:limit]
    payloads = []
    for entry in candidates:
        company = entry["companies"].most_common(1)[0][0] if entry["companies"] else _slug_name(entry["board"])
        payload = _candidate_payload(
            entry["provider"], entry["board"], company, source, {f"{source}_postings": entry["count"]}
        )
        if payload:
            payloads.append(payload)
    counts = {"candidates": len(candidates), "insertable": len(payloads), "inserted": 0}
    if apply and client is not None and payloads:
        counts["inserted"] = _insert_boards(client, payloads)
    return counts


def discover_from_freehire(*, limit: int | None = None, apply: bool = False) -> dict[str, int]:
    from jobpulse_scraper.database.client import get_supabase  # noqa: PLC0415

    try:
        client = get_supabase()
    except Exception:
        client = None
    if apply and client is None:
        raise RuntimeError("Supabase credentials are required to apply")
    return discover_from_records(
        _freehire_ie_jobs(), source="freehire", known=_live_boards(), limit=limit, apply=apply, client=client
    )


def discover_from_jobs(*, limit: int | None = None, apply: bool = False) -> dict[str, int]:
    """Recover token-based board identities from the postings we already store."""
    from jobpulse_scraper.database.client import get_supabase, retry_supabase  # noqa: PLC0415
    from jobpulse_scraper.database.records import response_records  # noqa: PLC0415

    rows: list[dict[str, Any]] = []
    client = None
    try:
        client = get_supabase()
    except Exception:
        client = None
    if client is not None:
        sb = client
        page = 0
        while True:
            batch = response_records(
                retry_supabase(
                    lambda p=page: sb.table("jobs").select("company,url").range(p * 1000, p * 1000 + 999).execute()
                ).data
            )
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < 1000:
                break
            page += 1
    if apply and client is None:
        raise RuntimeError("Supabase credentials are required to apply")
    return discover_from_records(rows, source="job-urls", known=_live_boards(), limit=limit, apply=apply, client=client)


def discover(
    provider: str,
    *,
    limit: int = 50,
    crawls: int = 3,
    apply: bool = False,
) -> dict[str, int]:
    from jobpulse_scraper.database.client import get_supabase  # noqa: PLC0415
    from jobpulse_scraper.database.records import select_all_records  # noqa: PLC0415

    try:
        client = get_supabase()
        board_client = client
        board_rows = select_all_records(
            lambda: board_client.table("boards").select("provider,board").in_("status", LIVE_STATUSES).order("id")
        )
        existing = {(str(row["provider"]), str(row["board"]).lower()) for row in board_rows}
    except Exception:
        if apply:
            raise
        client = None
        existing = set()

    counts = {"candidates": 0, "already_known": 0, "probed": 0, "irish_boards": 0, "inserted": 0}
    new_boards: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for crawl_id in latest_crawl_indexes(crawls):
        urls = cdx_urls(crawl_id, PROVIDERS[provider]["pattern"], domain=PROVIDERS[provider]["domain"], limit=limit * 5)
        for board, candidate_url in candidate_boards(provider, urls).items():
            key = (provider, board.lower())
            if key in existing or key in seen:
                counts["already_known"] += 1
                continue
            seen.add(key)
            counts["candidates"] += 1
            if counts["candidates"] > limit:
                break
            counts["probed"] += 1
            irish = probe_irish(provider, board, candidate_url, _slug_name(board))
            if irish <= 0:
                continue
            counts["irish_boards"] += 1
            new_boards.append(
                {
                    "provider": provider,
                    "board": board,
                    "region": "",
                    "company": resolve_company_name(provider, board, candidate_url),
                    "careers_url": candidate_url,
                    "sector": "General",
                    "priority": 40,
                    "enabled": True,
                    "status": "pending",
                    "discovery_source": "commoncrawl",
                    "metadata": {"irish_postings": irish, "crawl": crawl_id},
                }
            )
        if counts["candidates"] > limit:
            break

    if apply and client is not None and new_boards:
        client.table("boards").insert(new_boards).execute()
        counts["inserted"] = len(new_boards)
    return counts


def _select_all(client: Any, table: str, columns: str) -> list[dict[str, Any]]:
    from jobpulse_scraper.database.client import retry_supabase  # noqa: PLC0415
    from jobpulse_scraper.database.records import response_records  # noqa: PLC0415

    rows: list[dict[str, Any]] = []
    page = 0
    while True:
        batch = response_records(
            retry_supabase(
                lambda p=page: client.table(table).select(columns).range(p * 1000, p * 1000 + 999).execute()
            ).data
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        page += 1
    return rows


def discover_from_employers(*, limit: int | None = None, apply: bool = False) -> dict[str, int]:
    """Resolve an ATS board for employers that have none, from our own registry.

    Independent of any third-party catalogue: it reads the employers we already track
    and sniffs the ATS behind each careers URL, so a custom-domain site becomes a board.
    """
    from jobpulse_scraper.config.boards import detect_provider  # noqa: PLC0415
    from jobpulse_scraper.database.client import get_supabase  # noqa: PLC0415
    from jobpulse_scraper.network.http_client import fetch_url_with_final  # noqa: PLC0415
    from tools.sniff_ats import sniff_ats_from_url_and_html  # noqa: PLC0415

    try:
        client = get_supabase()
    except Exception:
        client = None
    if apply and client is None:
        raise RuntimeError("Supabase credentials are required to apply")

    employers = _select_all(client, "employers", "id,name,careers_url") if client else []
    boards = _select_all(client, "boards", "employer_id") if client else []
    linked = {row["employer_id"] for row in boards if row.get("employer_id")}
    known = _live_boards()
    candidates = [e for e in employers if str(e.get("careers_url") or "").strip() and e["id"] not in linked]
    if limit:
        candidates = candidates[:limit]

    payloads: list[dict[str, Any]] = []
    for employer in candidates:
        url = str(employer["careers_url"]).strip()
        provider, board = detect_provider(url)
        if provider == "generic":
            try:
                final_url, page = fetch_url_with_final(url, timeout=15)
                sniffed = sniff_ats_from_url_and_html(final_url, page)
            except Exception:
                sniffed = None
            if sniffed:
                provider, board = detect_provider(sniffed[1])
        if provider == "generic" or not board:
            continue
        key = (provider, board.lower())
        if key in known:
            continue
        known.add(key)
        payload = _candidate_payload(
            provider, board, str(employer["name"]), "employers", {"employer_id": employer["id"]}
        )
        if payload:
            payloads.append(payload)

    counts = {"candidates": len(candidates), "insertable": len(payloads), "inserted": 0}
    if apply and client is not None and payloads:
        counts["inserted"] = _insert_boards(client, payloads)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        choices=["freehire", "jobs", "employers", "commoncrawl"],
        default="freehire",
        help="Where board identities come from",
    )
    parser.add_argument("--provider", choices=[*PROVIDERS, "all"], default="all", help="Common Crawl provider scope")
    parser.add_argument("--limit", type=int, default=50, help="Max new boards to add per run")
    parser.add_argument("--crawls", type=int, default=3, help="How many recent Common Crawl indexes to sweep")
    parser.add_argument("--apply", action="store_true", help="Insert discovered boards as pending")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")

    if args.source == "freehire":
        results: dict[str, dict[str, int]] = {"freehire": discover_from_freehire(limit=args.limit, apply=args.apply)}
    elif args.source == "jobs":
        results = {"jobs": discover_from_jobs(limit=args.limit, apply=args.apply)}
    elif args.source == "employers":
        results = {"employers": discover_from_employers(limit=args.limit, apply=args.apply)}
    else:
        providers = list(PROVIDERS) if args.provider == "all" else [args.provider]
        results = {p: discover(p, limit=args.limit, crawls=args.crawls, apply=args.apply) for p in providers}
    print(json.dumps({"results": results, "applied": args.apply}, indent=2))
    if not args.apply:
        print("Dry run. Re-run with --apply to persist discovered boards.")


if __name__ == "__main__":
    main()
