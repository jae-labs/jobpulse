"""Conservative shared-posting plans; tenant-sensitive merges remain in PostgreSQL."""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.engine.normalization import canonical_job_url, normalize_company_name, normalized_key


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def posting_url(url: str) -> bool:
    """Require a public posting reference before joining different company labels."""
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        return False
    query = parse_qs(parsed.query)
    if any(query.get(key) for key in ("id", "jobid", "reqid", "opportunityid", "p_recruitment_id", "jid")):
        return True
    return bool(
        re.search(r"/(?:jobs?|careers|requisitions/preview)/[^?#]*\d", parsed.path, re.IGNORECASE)
        or re.search(r"/[0-9a-f]{8}-[0-9a-f-]{27,}(?:/|$)", parsed.path, re.IGNORECASE)
    )


def same_posting(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Same URL is necessary; conflicting titles, places or closure states stay separate."""
    url = canonical_job_url(str(left.get("url") or ""))
    if not url or url != canonical_job_url(str(right.get("url") or "")):
        return False
    if not _text(left.get("title")) or _text(left.get("title")) != _text(right.get("title")):
        return False
    if not _text(left.get("location")) or _text(left.get("location")) != _text(right.get("location")):
        return False
    if bool(left.get("closed_at")) != bool(right.get("closed_at")):
        return False
    # Company aliases may share one provider-native posting, but a generic landing
    # page cannot establish that different employers publish the same vacancy.
    return posting_url(url) or (
        bool(normalize_company_name(str(left.get("company") or "")))
        and normalize_company_name(str(left.get("company") or ""))
        == normalize_company_name(str(right.get("company") or ""))
    )


@dataclass(frozen=True)
class MergePlan:
    keeper: dict[str, Any]
    duplicate_ids: tuple[int, ...]
    dedupe_key: str


def merge_plans(rows: list[dict[str, Any]]) -> tuple[list[MergePlan], int]:
    """Skip entire conflicting URL groups; prefer an existing current identity and full body."""
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        url = canonical_job_url(str(row.get("url") or ""))
        if url:
            groups[url].append(row)
    plans: list[MergePlan] = []
    skipped = 0
    for group in groups.values():
        if len(group) < 2:
            continue
        if len(group) > 101 or any(not same_posting(group[0], row) for row in group[1:]):
            skipped += 1
            continue

        def preference(row: dict[str, Any]) -> tuple[bool, bool, int, int]:
            key = normalized_key(
                str(row.get("company") or ""),
                str(row.get("title") or ""),
                str(row.get("url") or ""),
                str(row.get("location") or ""),
                str(row.get("employment_type") or ""),
            )
            return (
                has_description_body(row.get("description")),
                row.get("dedupe_key") == key,
                len(str(row.get("description") or "")),
                -int(row["id"]),
            )

        keeper = max(group, key=preference)
        # Keep the existing key: merging aliases does not redefine every catalog
        # identity, and incoming confirmed aliases reuse this key during ingestion.
        key = keeper.get("dedupe_key") or normalized_key(
            str(keeper.get("company") or ""),
            str(keeper.get("title") or ""),
            str(keeper.get("url") or ""),
            str(keeper.get("location") or ""),
            str(keeper.get("employment_type") or ""),
        )
        plans.append(MergePlan(keeper, tuple(int(row["id"]) for row in group if row is not keeper), str(key)))
    return plans, skipped
