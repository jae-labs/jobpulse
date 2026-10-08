"""Bounded first-party public text witnesses with shared crawl pacing and denial policy."""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import json
import re
import socket
import ssl
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol
from urllib.parse import urljoin, urlsplit, urlunsplit

from jobpulse_scraper.company_index.store import domain
from jobpulse_scraper.network.experience import event as acquisition_event
from jobpulse_scraper.network.request_policy import gate, is_challenge_action


class EvidenceFailure(ValueError):
    def __init__(self, category: str):
        self.category = category
        super().__init__(category)


def failure_category(error: Exception) -> str:
    if isinstance(error, EvidenceFailure):
        return error.category
    message = str(error)
    known = {
        "First-party evidence HTTP failure": "http_failure",
        "Unsupported first-party response encoding": "unsupported_encoding",
        "First-party source returned a challenge": "content_challenge",
        "Evidence URL must be a query-free public first-party URL": "invalid_first_party_url",
        "Evidence URL resolves to a non-public address": "private_address",
        "Cached evidence checksum mismatch": "cache_checksum",
        "Company comparison provider timed out": "provider_timeout",
        "Company comparison provider failed": "provider_exit",
    }
    if message in known:
        return known[message]
    if isinstance(error, TimeoutError):
        return "acquisition_timeout"
    if isinstance(error, json.JSONDecodeError):
        return "invalid_json"
    if message.startswith("Model "):
        return "invalid_model_evidence"
    return type(error).__name__


class EvidenceProvider(Protocol):
    def fetch(self, url: str, expected_domain: str) -> dict: ...


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts: list[str] = []
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if isinstance(href, str):
                self.links.append(href)
        if tag in {"script", "style", "noscript", "template"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "template"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def visible_text(html: str) -> str:
    parser = VisibleText()
    parser.feed(html)
    return " ".join(" ".join(parser.parts).split())


def identity_links(html: str, url: str, expected_domain: str) -> list[str]:
    parser = VisibleText()
    parser.feed(html)
    result = []
    for href in parser.links:
        link = urljoin(url, href)
        parsed = urlsplit(link)
        if (
            domain(link) == expected_domain
            and not parsed.query
            and not parsed.fragment
            and re.search(r"(?:legal|terms|privacy|about|corporate)", parsed.path, re.I)
        ):
            result.append(link)
    return list(dict.fromkeys(result))[:3]


def public_url(url: str, expected_domain: str) -> str:
    parsed = urlsplit(url)
    if (
        domain(url) != expected_domain
        or not expected_domain
        or parsed.username
        or parsed.password
        or parsed.scheme not in {"http", "https"}
        or parsed.port not in {None, 443 if parsed.scheme == "https" else 80}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Evidence URL must be a query-free public first-party URL")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    if not addresses or any(
        not ipaddress.ip_address(a[4][0]).is_global or ipaddress.ip_address(a[4][0]).is_multicast for a in addresses
    ):
        raise ValueError("Evidence URL resolves to a non-public address")
    return str(addresses[0][4][0])


class EvidenceFetcher:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        # Public text witnesses expire independently of the large source snapshots.
        paths = sorted(root.glob("*.json"), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in paths)
        count = len(paths)
        for path in paths:
            if time.time() - path.stat().st_mtime > 7 * 86400 or count > 3000 or total > 50 * 1024**2:
                total -= path.stat().st_size
                count -= 1
                path.unlink()
        self.cache_count, self.cache_bytes = count, total
        self.requests = 0

    def fetch(self, url: str, expected_domain: str) -> dict:
        public_url(url, expected_domain)
        identity = hashlib.sha256(("company-evidence-v2:" + url).encode()).hexdigest()
        path = self.root / (identity + ".json")
        if path.exists() and time.time() - path.stat().st_mtime < 7 * 86400:
            witness = json.loads(path.read_text())
            if witness.get("sha256") == hashlib.sha256(witness["text"].encode()).hexdigest():
                return witness
            raise ValueError("Cached evidence checksum mismatch")
        current = url
        started = time.monotonic()
        for _ in range(4):
            if time.monotonic() - started >= 30:
                raise TimeoutError("First-party evidence exceeds acquisition deadline")
            public_url(current, expected_domain)
            data = self._request(current)
            if "redirect" in data:
                current = urljoin(current, data["redirect"])
                continue
            text = visible_text(data["html"])[:12000]
            witness = {
                "url": current,
                "text": text,
                "sha256": hashlib.sha256(text.encode()).hexdigest(),
                "identity_links": identity_links(data["html"], current, expected_domain),
                "fetched_at": time.time(),
                "truncated": len(visible_text(data["html"])) > 12000,
            }
            if not text:
                raise ValueError("Empty first-party evidence")
            if self.cache_count >= 3000 or self.cache_bytes + len(json.dumps(witness).encode()) > 50 * 1024**2:
                return {**witness, "cache_skipped": True}
            self.cache_count += 1
            self.cache_bytes += len(json.dumps(witness).encode())
            temporary = path.with_suffix(".partial")
            temporary.write_text(json.dumps(witness), encoding="utf-8")
            temporary.replace(path)
            return witness
        raise ValueError("First-party redirect budget exhausted")

    def _request(self, url: str) -> dict:
        parsed = urlsplit(url)
        # Pin the validated public address; acquisition never performs a second hostname lookup.
        address = public_url(url, domain(url))
        started = time.monotonic()
        policy_url = urlunsplit((parsed.scheme, parsed.hostname or "", parsed.path, "", ""))
        for verify in (True, False):
            delay = gate.reserve_delay(policy_url)
            if delay > 5:
                raise TimeoutError("Evidence host pacing exceeds acquisition budget")
            time.sleep(delay)
            gate.check(policy_url)
            self.requests += 1
            acquisition_event("request_sent", parsed.hostname or "")
            connection = http.client.HTTPConnection(
                parsed.hostname or "", parsed.port or (443 if parsed.scheme == "https" else 80), timeout=5
            )
            try:
                connection.sock = socket.create_connection((address, connection.port), timeout=5)
                if parsed.scheme == "https":
                    context = ssl.create_default_context() if verify else ssl._create_unverified_context()
                    connection.sock = context.wrap_socket(connection.sock, server_hostname=parsed.hostname)
                connection.request(
                    "GET",
                    parsed.path or "/",
                    headers={
                        "Host": parsed.hostname or "",
                        "User-Agent": "JobPulse public-company-research/1.0",
                        "Accept-Encoding": "identity",
                    },
                )
                response = connection.getresponse()
                gate.observe(policy_url, response.status, response.getheader("Retry-After"))
                if is_challenge_action(response.getheader("x-amzn-waf-action")):
                    gate.observe(policy_url, 403, response.getheader("Retry-After"))
                    raise ValueError("First-party source returned a challenge")
                if response.status in {301, 302, 303, 307, 308}:
                    location = response.getheader("Location")
                    if not location:
                        raise ValueError("First-party redirect lacks destination")
                    return {"redirect": location}
                if response.status != 200:
                    raise EvidenceFailure(f"http_{response.status}")
                if "text/html" not in (response.getheader("Content-Type") or ""):
                    raise ValueError("First-party evidence must be HTML")
                if response.getheader("Content-Encoding") not in {None, "identity"}:
                    raise ValueError("Unsupported first-party response encoding")
                body = bytearray()
                while block := response.read1(65536):
                    if time.monotonic() - started > 20:
                        raise TimeoutError("First-party response exceeds acquisition deadline")
                    body.extend(block)
                    if len(body) > 1024**2:
                        raise ValueError("First-party response exceeds 1 MiB")
                return {"html": body.decode("utf-8", errors="replace")}
            except ssl.SSLCertVerificationError:
                if not verify:
                    raise
            finally:
                connection.close()
        raise ValueError("First-party acquisition failed")
