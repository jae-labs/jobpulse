"""Typed public request opening for supported acquisition workflows."""

import ssl
from contextlib import AbstractContextManager
from typing import Any, Protocol
from urllib.request import Request


class RequestOpener(Protocol):
    def __call__(
        self, request: Request, *, timeout: int = 12, context: ssl.SSLContext | None = None
    ) -> AbstractContextManager[Any]: ...
