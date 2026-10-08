"""Process-safe request reservations and bounded public source observations."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

source_key: ContextVar[str] = ContextVar("request_source", default="unassigned")


class RequestLedger:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def transaction(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=30)
        try:
            connection.execute("PRAGMA busy_timeout=30000")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS hosts (host TEXT PRIMARY KEY, next_at REAL NOT NULL DEFAULT 0, "
                "cooldown REAL NOT NULL DEFAULT 0, interval REAL NOT NULL DEFAULT 0)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS observations (id INTEGER PRIMARY KEY, source TEXT NOT NULL, "
                "host TEXT NOT NULL, started REAL NOT NULL, status INTEGER, retry_after REAL NOT NULL DEFAULT 0)"
            )
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        finally:
            connection.close()

    def reserve(self, host: str, now: float, interval: float) -> tuple[float, float]:
        with self.transaction() as connection:
            connection.execute("INSERT OR IGNORE INTO hosts(host) VALUES (?)", (host,))
            next_at, cooldown, learned = connection.execute(
                "SELECT next_at,cooldown,interval FROM hosts WHERE host=?", (host,)
            ).fetchone()
            if cooldown > now:
                return 0, cooldown
            start = max(now, next_at)
            connection.execute("UPDATE hosts SET next_at=? WHERE host=?", (start + max(interval, learned), host))
            return start - now, 0

    def cooldown(self, host: str) -> float:
        with self.transaction() as connection:
            row = connection.execute("SELECT cooldown FROM hosts WHERE host=?", (host,)).fetchone()
            return row[0] if row else 0

    def observe(self, host: str, now: float, status: int, retry_after: float, cooldown: float, interval: float) -> None:
        with self.transaction() as connection:
            connection.execute("INSERT OR IGNORE INTO hosts(host) VALUES (?)", (host,))
            connection.execute(
                "INSERT INTO observations(source,host,started,status,retry_after) VALUES (?,?,?,?,?)",
                (source_key.get(), host, now, status, retry_after),
            )
            connection.execute(
                "UPDATE hosts SET cooldown=max(cooldown,?), interval=max(interval,?) WHERE host=?",
                (cooldown, min(60, interval * 2) if status == 429 else 0, host),
            )
            connection.execute(
                "DELETE FROM observations WHERE started<? OR id NOT IN "
                "(SELECT id FROM observations ORDER BY id DESC LIMIT 10000)",
                (now - 30 * 86400,),
            )

    def summary(self) -> list[dict[str, object]]:
        with self.transaction() as connection:
            rows = connection.execute(
                "SELECT source,host,count(*),sum(status BETWEEN 200 AND 399),"
                "sum(status IN (401,403,429)),min(started),max(started),max(retry_after) "
                "FROM observations GROUP BY source,host ORDER BY source,host"
            ).fetchall()
            columns = (
                "source",
                "host",
                "responses",
                "accepted",
                "denied",
                "first_at",
                "last_at",
                "retry_after_seconds",
            )
            summaries: list[dict[str, object]] = [dict(zip(columns, row, strict=True)) for row in rows]
            for summary in summaries:
                source, host = summary["source"], summary["host"]
                host_policy = connection.execute("SELECT interval,cooldown FROM hosts WHERE host=?", (host,)).fetchone()
                summary["learned_interval_seconds"], summary["cooldown_until"] = host_policy
                denial = connection.execute(
                    "SELECT id,started,status FROM observations WHERE source=? AND host=? AND status IN (401,403,429) ORDER BY id DESC LIMIT 1",
                    (source, host),
                ).fetchone()
                if denial:
                    event_id, observed, status = denial
                    ordinal = connection.execute(
                        "SELECT count(*) FROM observations WHERE source=? AND host=? AND id<=?",
                        (source, host, event_id),
                    ).fetchone()[0]
                    recent = connection.execute(
                        "SELECT count(*) FROM observations WHERE host=? AND id<=? AND started>=?",
                        (host, event_id, observed - 60),
                    ).fetchone()[0]
                    summary["latest_denial"] = {
                        "status": status,
                        "observed_at": observed,
                        "source_response_ordinal": ordinal,
                        "host_responses_in_previous_minute": recent,
                    }
            return summaries
