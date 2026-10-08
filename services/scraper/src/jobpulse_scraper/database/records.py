"""Validate row-shaped PostgREST responses at the external data boundary."""

from collections.abc import Callable
from typing import Any

from jobpulse_scraper.database.client import retry_supabase


def response_records(value: object) -> list[dict[str, Any]]:
    """Reject scalar RPC output and malformed rows instead of treating them as tables."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("Expected a database row array")
    records: list[dict[str, Any]] = []
    for row in value:
        if not isinstance(row, dict) or any(not isinstance(key, str) for key in row):
            raise ValueError("Expected a database row object")
        records.append({str(key): item for key, item in row.items()})
    return records


def response_object(value: object) -> dict[str, Any]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ValueError("Expected a database result object")
    return {str(key): item for key, item in value.items()}


def response_count(value: object) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError("Expected a database count")
    return value


def select_all_records(query: Callable[[], Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = response_records(retry_supabase(lambda start=offset: query().range(start, start + 999).execute()).data)
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += len(batch)
