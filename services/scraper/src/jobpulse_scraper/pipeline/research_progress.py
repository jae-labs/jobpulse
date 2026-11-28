"""Safe live progress for bounded company research stages."""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager


def event(kind: str, **fields: object) -> None:
    print(json.dumps({"company_research": kind, **fields}), flush=True)


@contextmanager
def progress(stage: str, *, interval: float = 15, **fields: object) -> Iterator[None]:
    started = time.monotonic()
    stopped = threading.Event()
    event("started", stage=stage, **fields)

    def heartbeat() -> None:
        while not stopped.wait(interval):
            event("waiting", stage=stage, elapsed_seconds=round(time.monotonic() - started, 1), **fields)

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stopped.set()
        thread.join()
        event("finished", stage=stage, elapsed_seconds=round(time.monotonic() - started, 1), **fields)
