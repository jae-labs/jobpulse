"""Bounded six-hour reuse of positively parsed public JobsIreland bodies."""

import hashlib
import time

from jobpulse_scraper.network.experience import event, ledger

MAX_ENTRIES = 1000
MAX_BODY_BYTES = 65536
FRESH_SECONDS = 6 * 3600


def cached_body(url: str) -> str | None:
    with ledger().transaction() as connection:
        row = connection.execute(
            "SELECT body FROM detail_bodies WHERE identity=? AND verified_at>?",
            (hashlib.sha256(url.encode()).hexdigest(), time.time() - FRESH_SECONDS),
        ).fetchone()
    if row:
        event("detail_cache_hit")
    return row[0] if row else None


def remember_body(url: str, body: str) -> None:
    if not body or len(body.encode()) > MAX_BODY_BYTES:
        return
    with ledger().transaction() as connection:
        connection.execute(
            "INSERT INTO detail_bodies(identity,body,verified_at) VALUES(?,?,?) "
            "ON CONFLICT(identity) DO UPDATE SET body=excluded.body,verified_at=excluded.verified_at",
            (hashlib.sha256(url.encode()).hexdigest(), body, time.time()),
        )
        connection.execute(
            "DELETE FROM detail_bodies WHERE verified_at<? OR identity NOT IN "
            "(SELECT identity FROM detail_bodies ORDER BY verified_at DESC LIMIT ?)",
            (time.time() - FRESH_SECONDS, MAX_ENTRIES),
        )
