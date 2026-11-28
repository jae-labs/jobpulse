"""Bounded public posting requests pin DNS and never follow replacement routes blindly."""

from __future__ import annotations

import http.client
import ipaddress
import re
import socket
import ssl
import time
from urllib.parse import urljoin, urlsplit

from jobpulse_scraper.config.rules import ERROR_ANTI_BOT_PATTERNS
from jobpulse_scraper.contracts import FetchResponse, ResponseBudgetExceeded
from jobpulse_scraper.engine.text_cleaner import clean_text
from jobpulse_scraper.network.experience import event
from jobpulse_scraper.network.http_client import DEFAULT_USER_AGENT, wire_url
from jobpulse_scraper.network.request_policy import ContentChallenge, gate, is_challenge_action

MAX_POSTING_BYTES = 2 * 1024**2


def public_address(url: str) -> str:
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 443 if parsed.scheme == "https" else 80}
        or len(url) > 4096
    ):
        raise ValueError("Invalid public posting URL")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    if not addresses or any(
        not ipaddress.ip_address(a[4][0]).is_global or ipaddress.ip_address(a[4][0]).is_multicast for a in addresses
    ):
        raise ValueError("Posting URL resolves to a private address")
    return str(addresses[0][4][0])


class PostingTransport:
    def fetch(self, url: str) -> FetchResponse:
        address = public_address(url)
        parsed = urlsplit(wire_url(url))
        for verify in (True, False):
            delay = gate.reserve_delay(url)
            if delay > 5:
                raise TimeoutError("Posting host pacing exceeds probe budget")
            time.sleep(delay)
            gate.check(url)
            event("request_sent", parsed.hostname or "")
            connection = http.client.HTTPConnection(
                parsed.hostname or "", parsed.port or (443 if parsed.scheme == "https" else 80), timeout=5
            )
            started = time.monotonic()
            response = None
            challenge = False
            try:
                connection.sock = socket.create_connection((address, connection.port), timeout=5)
                if parsed.scheme == "https":
                    context = ssl.create_default_context() if verify else ssl._create_unverified_context()
                    connection.sock = context.wrap_socket(connection.sock, server_hostname=parsed.hostname)
                path = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
                connection.request(
                    "GET",
                    path,
                    headers={
                        "Host": parsed.hostname or "",
                        "User-Agent": DEFAULT_USER_AGENT,
                        "Accept-Encoding": "identity",
                    },
                )
                response = connection.getresponse()
                challenge = is_challenge_action(response.getheader("x-amzn-waf-action"))
                if challenge:
                    raise ContentChallenge(url, response.status)
                if 300 <= response.status < 400:
                    return FetchResponse(urljoin(url, response.getheader("Location") or ""), response.status, b"")
                if response.status != 200:
                    return FetchResponse(url, response.status, b"")
                if response.getheader("Content-Encoding") not in {None, "identity"}:
                    raise ValueError("Unsupported posting encoding")
                body = bytearray()
                while block := response.read1(65536):
                    body.extend(block)
                    if len(body) > MAX_POSTING_BYTES:
                        raise ResponseBudgetExceeded("Posting body exceeds probe budget")
                    if time.monotonic() - started > 15:
                        raise TimeoutError("Posting body exceeds probe deadline")
                text = clean_text(body.decode("utf-8", errors="replace")).lower()
                challenge = any(re.search(pattern, text) for pattern in ERROR_ANTI_BOT_PATTERNS)
                if challenge:
                    raise ContentChallenge(url, response.status)
                return FetchResponse(url, response.status, bytes(body), response.getheader("Content-Type") or "")
            except ssl.SSLCertVerificationError:
                if not verify:
                    raise
            finally:
                try:
                    if response is not None:
                        gate.observe(url, response.status, response.getheader("Retry-After"), content_blocked=challenge)
                finally:
                    connection.close()
        raise ValueError("Posting acquisition failed")
