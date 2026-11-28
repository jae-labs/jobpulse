"""The active database lease follows synchronous ingestion calls."""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class Lease:
    task_id: str
    token: str


active_lease: ContextVar[Lease | None] = ContextVar("crawl_lease", default=None)

active_snapshot: ContextVar[str | None] = ContextVar("crawl_snapshot", default=None)
