"""Database crawl targets with YAML fallback when the catalog is unavailable."""

from __future__ import annotations

import re
import threading
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

# (provider, pattern). Group 1, when present, is the provider-native board id;
# otherwise the URL host+path identifies the board. Order matters: the first
# match wins, so parameterised ATS hosts precede their generic parents.
PROVIDER_URL_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("greenhouse", re.compile(r"(?:job-boards|boards)(?:-api)?\.greenhouse\.io/([A-Za-z0-9_-]+)", re.I)),
    ("lever", re.compile(r"jobs\.lever\.co/([A-Za-z0-9_-]+)", re.I)),
    ("ashby", re.compile(r"jobs\.ashbyhq\.com/([A-Za-z0-9_.-]+)", re.I)),
    ("smartrecruiters", re.compile(r"(?:careers|jobs)\.smartrecruiters\.com/([A-Za-z0-9_-]+)", re.I)),
    ("workable", re.compile(r"apply\.workable\.com/([A-Za-z0-9_-]+)", re.I)),
    ("bamboohr", re.compile(r"([A-Za-z0-9-]+)\.bamboohr\.com", re.I)),
    ("personio", re.compile(r"([A-Za-z0-9-]+)\.jobs\.personio\.(?:de|com)", re.I)),
    ("teamtailor", re.compile(r"([A-Za-z0-9-]+)\.teamtailor\.com", re.I)),
    ("recruitee", re.compile(r"([A-Za-z0-9-]+)\.recruitee\.com", re.I)),
    ("breezy", re.compile(r"([A-Za-z0-9-]+)\.breezy\.hr", re.I)),
    ("pinpoint", re.compile(r"([A-Za-z0-9-]+)\.pinpointhq\.com", re.I)),
    ("rippling", re.compile(r"ats\.rippling\.com/([A-Za-z0-9_-]+)", re.I)),
    ("zohorecruit", re.compile(r"https?://([A-Za-z0-9.-]+\.zohorecruit\.[a-z.]+)", re.I)),
    ("manatal", re.compile(r"careers-page\.com/([A-Za-z0-9_-]+)", re.I)),
    ("rezoomo", re.compile(r"(?:www\.)?rezoomo\.com", re.I)),
    ("amazon", re.compile(r"amazon\.jobs", re.I)),
    ("hubspot", re.compile(r"hubspot\.com/careers", re.I)),
    ("lidl", re.compile(r"jobs\.lidl\.ie", re.I)),
    ("jobtrain", re.compile(r"jobtrain\.co\.uk", re.I)),
    ("candidatemanager", re.compile(r"candidatemanager\.net", re.I)),
    ("corehr", re.compile(r"my\.corehr\.com", re.I)),
    ("musgrave", re.compile(r"musgrave", re.I)),
    ("oracle", re.compile(r"(?:oraclecloud\.com|taleo\.net)", re.I)),
    ("linkedin", re.compile(r"linkedin\.com", re.I)),
    ("avature", re.compile(r"avature\.net", re.I)),
    ("icims", re.compile(r"https?://([A-Za-z0-9.-]+\.icims\.com)", re.I)),
    ("eightfold", re.compile(r"https?://([A-Za-z0-9.-]+\.eightfold\.ai)", re.I)),
]

# Segments that name the embed/API surface rather than the tenant board.
_NON_BOARD_SEGMENTS = {"embed", "js", "api", "v1", "boards", "jobs"}

_WORKDAY_PATTERN = re.compile(
    r"https?://([A-Za-z0-9.-]+\.myworkdayjobs\.com)/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_-]+)", re.I
)

_UKG_PATTERN = re.compile(r"https?://([^/]+)/([^/]+)/JobBoard/([0-9a-fA-F-]{36})", re.I)

_DAYFORCE_PATTERN = re.compile(r"jobs\.dayforcehcm\.com/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)", re.I)

_DB_CACHE: list[dict[str, Any]] | None = None
_DB_CACHE_SET = False
_COMPANY_INDEX: dict[str, dict[str, Any]] | None = None
_URL_INDEX: dict[str, dict[str, Any]] | None = None
_CACHE_LOCK = threading.RLock()


def clear_board_cache() -> None:
    global _DB_CACHE, _DB_CACHE_SET, _COMPANY_INDEX, _URL_INDEX
    with _CACHE_LOCK:
        _DB_CACHE = None
        _DB_CACHE_SET = False
        _COMPANY_INDEX = None
        _URL_INDEX = None


def _board_from_url(url: str) -> str:
    """Host + path, query stripped: a stable fallback board identity."""
    parsed = urlsplit(url)
    return f"{parsed.netloc}{parsed.path}".rstrip("/") or parsed.netloc


def detect_provider(careers_url: str) -> tuple[str, str]:
    """Return ``(provider, board)`` for a careers URL.

    Falls back to ``("generic", host+path)`` so an unknown site is still a
    unique, crawlable board identity rather than an empty string.
    """
    url = (careers_url or "").strip()
    workday = _WORKDAY_PATTERN.search(url)
    if workday:
        return "workday", f"{workday.group(1).lower()}/{workday.group(2)}"
    ukg = _UKG_PATTERN.search(url)
    if ukg:
        return "ukg", f"{ukg.group(1).lower()}/{ukg.group(2)}/JobBoard/{ukg.group(3)}"
    dayforce = _DAYFORCE_PATTERN.search(url)
    if dayforce:
        return "dayforce", f"{dayforce.group(1)}/{dayforce.group(2)}"
    for provider, pattern in PROVIDER_URL_PATTERNS:
        match = pattern.search(url)
        if not match:
            continue
        board = ""
        if match.groups():
            board = (match.group(1) or "").strip("/?#")
        if not board or board.lower() in _NON_BOARD_SEGMENTS:
            board = _board_from_url(url)
        return provider, board
    return "generic", _board_from_url(url) or url


def _row_to_target(row: dict[str, Any]) -> dict[str, Any]:
    """Map a `boards` row to the crawler website configuration."""
    return {
        "name": row["company"],
        "sector": row.get("sector") or "General",
        "priority": row.get("priority", 50),
        "careers_url": row["careers_url"],
        "enabled": row.get("enabled", True),
        "scraper": "generic_crawler",
        "scraper_type": "watchlist",
        "notes": "",
        "provider": row.get("provider", "generic"),
        "board": row.get("board", ""),
        "region": row.get("region", ""),
        "board_id": row.get("id"),
        "status": row.get("status", "active"),
        "consecutive_failures": row.get("consecutive_failures", 0),
        "cooldown_until": row.get("cooldown_until"),
    }


def _parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def is_cooled_down(target: dict[str, Any] | None, *, now: datetime | None = None) -> bool:
    """True while a board's backoff window is still open."""
    if not target:
        return False
    until = _parse_timestamp(target.get("cooldown_until"))
    if until is None:
        return False
    return until > (now or datetime.now(UTC))


def cooled_down_companies() -> list[str]:
    """Company names whose catalog board is currently cooling down."""
    rows = _all_targets()
    if not rows:
        return []
    now = datetime.now(UTC)
    return [target["name"] for target in (_row_to_target(row) for row in rows) if is_cooled_down(target, now=now)]


def _fetch_all_targets() -> list[dict[str, Any]] | None:
    """Read every live catalog row, or ``None`` when the store is unavailable."""
    # Imported lazily so this module stays importable without Supabase config
    # and so `database.client` never imports `config` in a cycle.
    try:
        from database.client import get_supabase, retry_supabase
        from database.records import response_records
    except Exception:
        return None
    try:
        client = get_supabase()
    except Exception:
        return None

    rows: list[dict[str, Any]] = []
    try:
        page = 0
        while True:
            query = (
                client.table("boards")
                .select("*")
                .in_("status", ["pending", "active"])
                .order("priority", desc=True)
                .order("id")
            )
            batch = response_records(
                retry_supabase(lambda q=query, p=page: q.range(p * 1000, p * 1000 + 999).execute()).data
            )
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < 1000:
                break
            page += 1
    except Exception:
        return None
    return rows


def _all_targets() -> list[dict[str, Any]] | None:
    global _DB_CACHE, _DB_CACHE_SET
    with _CACHE_LOCK:
        if not _DB_CACHE_SET:
            _DB_CACHE = _fetch_all_targets()
            _DB_CACHE_SET = True
        return _DB_CACHE


def load_board_targets(enabled_only: bool = False) -> list[dict[str, Any]] | None:
    """An empty catalog is authoritative; only an unavailable catalog returns None."""
    rows = _all_targets()
    if rows is None:
        return None
    targets = [_row_to_target(row) for row in rows]
    if enabled_only:
        targets = [target for target in targets if target["enabled"]]
    return targets


def load_board_config(enabled_only: bool = False) -> list[dict[str, Any]]:
    """Load crawl targets from the database, falling back to the YAML seed."""
    targets = load_board_targets(enabled_only=enabled_only)
    if targets is not None:
        return targets
    from config.loader import load_websites_config

    data = load_websites_config()
    if enabled_only:
        data = [entry for entry in data if entry.get("enabled", True)]
    return data


def get_board_employer_tuples(
    enabled_only: bool = False,
) -> list[tuple[str, str, int, str]]:
    """Return ``(name, sector, priority, careers_url)`` tuples from the catalog."""
    return [
        (entry["name"], entry.get("sector", "General"), entry.get("priority", 50), entry["careers_url"])
        for entry in load_board_config(enabled_only=enabled_only)
    ]


def _build_catalog_indexes() -> None:
    global _COMPANY_INDEX, _URL_INDEX
    with _CACHE_LOCK:
        if _COMPANY_INDEX is not None:
            return
        _COMPANY_INDEX, _URL_INDEX = {}, {}
        for row in _all_targets() or []:
            target = _row_to_target(row)
            _COMPANY_INDEX.setdefault(target["name"].strip().lower(), target)
            url = str(target["careers_url"]).strip().rstrip("/").lower()
            if url:
                _URL_INDEX.setdefault(url, target)


def catalog_entry_for(company: str) -> dict[str, Any] | None:
    with _CACHE_LOCK:
        _build_catalog_indexes()
        return (_COMPANY_INDEX or {}).get(company.strip().lower())


def catalog_entry_for_url(careers_url: str) -> dict[str, Any] | None:
    with _CACHE_LOCK:
        _build_catalog_indexes()
        return (_URL_INDEX or {}).get(careers_url.strip().rstrip("/").lower())


# Providers whose board id is a tenant token that maps directly onto a canonical
# listing URL. Providers absent here use the host/path board as an ``https://`` URL.
_CANONICAL_BOARD_URLS: dict[str, str] = {
    "greenhouse": "https://job-boards.greenhouse.io/{board}",
    "lever": "https://jobs.lever.co/{board}",
    "ashby": "https://jobs.ashbyhq.com/{board}",
    "smartrecruiters": "https://careers.smartrecruiters.com/{board}",
    "workable": "https://apply.workable.com/{board}",
    "bamboohr": "https://{board}.bamboohr.com/jobs",
    "personio": "https://{board}.jobs.personio.de",
    "teamtailor": "https://{board}.teamtailor.com",
    "recruitee": "https://{board}.recruitee.com",
    "breezy": "https://{board}.breezy.hr",
    "pinpoint": "https://{board}.pinpointhq.com",
    "rippling": "https://ats.rippling.com/{board}/jobs",
    "manatal": "https://www.careers-page.com/{board}",
    "dayforce": "https://jobs.dayforcehcm.com/en-US/{board}",
}

# Provider keys that carry a full host (optionally with a path) as their board.
_HOST_BOARD_PROVIDERS = {
    "workday",
    "oracle",
    "icims",
    "avature",
    "eightfold",
    "rezoomo",
    "corehr",
    "amazon",
    "hubspot",
    "lidl",
    "jobtrain",
    "candidatemanager",
    "linkedin",
    "musgrave",
    "ukg",
    "radancy",
    "successfactors",
    "jobvite",
    "sitemap",
    "zohorecruit",
    "phenom",
}


def board_url(provider: str, board: str) -> str | None:
    """Build a canonical listing URL from a catalog identity, or ``None``.

    Lets a known provider/board be crawled even when the configured careers URL
    hides the ATS behind a vanity domain.
    """
    if not provider or not board:
        return None
    template = _CANONICAL_BOARD_URLS.get(provider)
    if template:
        return template.format(board=board.strip("/"))
    if provider in _HOST_BOARD_PROVIDERS and ("." in board or "/" in board):
        return f"https://{board.lstrip('/')}"
    return None
