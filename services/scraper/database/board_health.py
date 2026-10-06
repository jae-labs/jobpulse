"""Board crawl health: record outcomes through the atomic database function."""

from __future__ import annotations

from typing import Any


def record_board_outcome(
    client: Any,
    board_id: int,
    *,
    success: bool,
    ingested: int = 0,
    error: str | None = None,
    found: int | None = None,
) -> None:
    """Record one board crawl outcome; Postgres owns the increment and backoff."""
    client.rpc(
        "record_board_outcome",
        {
            "p_board_id": board_id,
            "p_success": bool(success),
            "p_ingested": max(int(ingested or 0), 0),
            "p_error": (error or "")[:1000] or None,
            "p_found": None if found is None else max(int(found), 0),
        },
    ).execute()
