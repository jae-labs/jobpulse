"""Link catalog boards to the employers table by exact or normalized name.

Preview by default. Resolution is conservative: an exact (or curated canonical)
name first, then a legal-suffix fold, and only when it identifies a single
employer. `employer_id` lets the UI, scoring and map join a board to the company
registry instead of matching names at read time.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase  # noqa: E402
from database.records import select_all_records  # noqa: E402
from pipeline.employer_lookup import EmployerLookupService, curated_employer, normalize_company_key  # noqa: E402

LIVE_STATUSES = ["pending", "active"]


def _strong_keys(name: str) -> set[str]:
    """Exact names plus any curated canonical name."""
    keys: set[str] = set()
    clean = (name or "").strip()
    if clean:
        keys.add(clean.casefold())
    curated = curated_employer(clean)
    if curated and curated.get("name"):
        keys.add(str(curated["name"]).casefold())
    return keys


def _weak_keys(name: str) -> set[str]:
    """Legal-suffix-folded keys, for a board whose name differs only by Ireland/Ltd."""
    normalized = normalize_company_key(name)
    return {normalized} if normalized else set()


def _build_index(employers: list[dict[str, Any]], key_fn: Any) -> dict[str, set[int]]:
    index: dict[str, set[int]] = defaultdict(set)
    for employer in employers:
        employer_id = employer.get("id")
        if employer_id is None:
            continue
        for key in key_fn(str(employer.get("name") or "")):
            index[key].add(employer_id)
    return index


def _resolve(name: str, strong: dict[str, set[int]], weak: dict[str, set[int]]) -> int | None:
    strong_hits: set[int] = set()
    for key in _strong_keys(name):
        strong_hits |= strong.get(key, set())
    if len(strong_hits) == 1:
        return next(iter(strong_hits))
    if strong_hits:
        return None
    weak_hits: set[int] = set()
    for key in _weak_keys(name):
        weak_hits |= weak.get(key, set())
    return next(iter(weak_hits)) if len(weak_hits) == 1 else None


def match_board_employers(boards: list[dict[str, Any]], employers: list[dict[str, Any]]) -> list[tuple[int, int]]:
    """Return ``(board_id, employer_id)`` pairs resolved to a single employer."""
    strong = _build_index(employers, _strong_keys)
    weak = _build_index(employers, _weak_keys)
    pairs: list[tuple[int, int]] = []
    for board in boards:
        employer_id = _resolve(str(board.get("company") or ""), strong, weak)
        if employer_id is not None and board.get("employer_id") != employer_id:
            pairs.append((board["id"], employer_id))
    return pairs


def _select_all(client: Any, table: str, columns: str) -> list[dict[str, Any]]:
    return select_all_records(lambda: client.table(table).select(columns).order("id"))


def backfill_board_employers(*, apply: bool = False, create: bool = False) -> dict[str, int]:
    client = get_supabase()
    employers = _select_all(client, "employers", "id,name")
    boards = _select_all(client, "boards", "id,company,employer_id,careers_url,status")
    boards = [board for board in boards if board.get("status") in LIVE_STATUSES]

    strong = _build_index(employers, _strong_keys)
    weak = _build_index(employers, _weak_keys)
    pairs: list[tuple[int, int]] = []
    unresolved: list[dict[str, Any]] = []
    unmatched = 0
    for board in boards:
        employer_id = _resolve(str(board.get("company") or ""), strong, weak)
        if employer_id is None:
            if board.get("employer_id") is None:
                unmatched += 1
                unresolved.append(board)
            continue
        if board.get("employer_id") != employer_id:
            pairs.append((board["id"], employer_id))

    created = 0
    create_failed = 0
    if create and unresolved:
        service = EmployerLookupService(client)
        for board in unresolved:
            try:
                employer = service.resolve_employer(
                    str(board.get("company") or ""),
                    careers_url=str(board.get("careers_url") or ""),
                    persist=apply,
                )
            except Exception:
                create_failed += 1
                continue
            if not employer:
                create_failed += 1
                continue
            if not apply:
                created += 1
            elif employer.get("id") is not None:
                pairs.append((board["id"], employer["id"]))
                created += 1

    counts = {
        "boards": len(boards),
        "employers": len(employers),
        "to_update": len(pairs),
        "unmatched_boards": unmatched,
        "to_create": created,
        "create_failed": create_failed,
    }
    if apply:
        for board_id, employer_id in pairs:
            client.table("boards").update({"employer_id": employer_id}).eq("id", board_id).execute()
        counts["updated"] = len(pairs)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write employer_id links to the boards table")
    parser.add_argument(
        "--create",
        action="store_true",
        help="Create employers for boards that match no existing employer, then link them",
    )
    args = parser.parse_args()
    counts = backfill_board_employers(apply=args.apply, create=args.create)
    print(json.dumps({**counts, "applied": args.apply}, indent=2))
    if not args.apply:
        print("Dry run. Re-run with --apply to persist.")


if __name__ == "__main__":
    main()
