"""Seed the database board catalog from config/websites.yaml and board_seeds.yaml.

Preview by default. The `boards` table is the source of truth for crawl targets;
the YAML files remain the bootstrap seed. This tool is idempotent: it matches on
(provider, lower(board), region) and updates existing live rows in place.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml  # noqa: E402

from config import detect_provider, load_websites_config  # noqa: E402
from database.client import get_supabase  # noqa: E402
from database.records import select_all_records  # noqa: E402

SCRAPER_ROOT = Path(__file__).resolve().parent.parent
LIVE_STATUSES = ["pending", "active"]


def _seed_entries(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return data.get("seeds", []) or []


def _payload(entry: dict[str, Any], *, discovery_source: str, status: str) -> dict[str, Any]:
    careers_url = str(entry["careers_url"]).strip()
    provider, board = detect_provider(careers_url)
    return {
        "provider": provider,
        "board": board,
        "region": "",
        "company": str(entry["name"]).strip(),
        "careers_url": careers_url,
        "sector": str(entry.get("sector", "General")).strip() or "General",
        "priority": int(entry.get("priority", 50)),
        "enabled": bool(entry.get("enabled", True)),
        "status": status,
        "discovery_source": discovery_source,
        "metadata": {"seed_url": careers_url},
    }


def build_payloads() -> list[dict[str, Any]]:
    """Merge watchlist entries and candidate seeds, config winning on identity."""
    payloads: dict[tuple[str, str, str], dict[str, Any]] = {}
    # Seeds first so a watchlist row with the same identity overrides it.
    for entry in _seed_entries(SCRAPER_ROOT / "config" / "board_seeds.yaml"):
        item = _payload(entry, discovery_source="seed", status="pending")
        payloads[(item["provider"], item["board"].lower(), item["region"])] = item
    for entry in load_websites_config():
        item = _payload(entry, discovery_source="config", status="active")
        payloads[(item["provider"], item["board"].lower(), item["region"])] = item
    return list(payloads.values())


def import_boards(*, apply: bool = False) -> dict[str, int]:
    payloads = build_payloads()
    try:
        client = get_supabase()
    except Exception:
        client = None

    existing: list[dict[str, Any]] = []
    if client is not None:
        try:
            existing = select_all_records(
                lambda: (
                    client.table("boards")
                    .select("id,provider,board,region,status")
                    .in_("status", LIVE_STATUSES)
                    .order("id")
                )
            )
        except Exception:
            if apply:
                raise
            existing = []
    by_key = {(row["provider"], row["board"].lower(), row["region"]): row for row in existing}

    counts = {"total": len(payloads), "inserted": 0, "updated": 0}
    inserts: list[dict[str, Any]] = []
    updates: list[tuple[dict[str, Any], int]] = []
    for item in payloads:
        row = by_key.get((item["provider"], item["board"].lower(), item["region"]))
        if row is None:
            inserts.append(item)
            continue
        desired_status = "active" if row["status"] == "active" or item["status"] == "active" else "pending"
        updates.append(({**item, "status": desired_status}, row["id"]))
        counts["updated"] += 1

    counts["inserted"] = len(inserts)
    if not apply:
        return counts
    if client is None:
        raise RuntimeError("Supabase credentials are required to apply the board import")
    for start in range(0, len(inserts), 500):
        client.table("boards").insert(inserts[start : start + 500]).execute()
    for update, row_id in updates:
        client.table("boards").update(update).eq("id", row_id).execute()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write rows to the boards table")
    args = parser.parse_args()
    counts = import_boards(apply=args.apply)
    print(json.dumps({**counts, "applied": args.apply}, indent=2))
    if not args.apply:
        print("Dry run. Re-run with --apply to persist.")


if __name__ == "__main__":
    main()
