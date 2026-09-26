from __future__ import annotations

from typing import Any

from pipeline.logger import format_error_message, log_scraper_event


def synchronize(*args: Any, **kwargs: Any) -> Any:
    from pipeline.runner import synchronize as _sync

    return _sync(*args, **kwargs)


__all__ = [
    "format_error_message",
    "log_scraper_event",
    "synchronize",
]
