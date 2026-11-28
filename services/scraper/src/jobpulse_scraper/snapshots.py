"""Bounded, content-addressed public response storage and offline parser replay."""

from __future__ import annotations

import fcntl
import gzip
import hashlib
import io
import json
import os
import re
import tempfile
import time
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from jobpulse_scraper.contracts import FetchResponse, RawJob, SourceTarget
from jobpulse_scraper.network.limits import MAX_RESPONSE_BYTES
from jobpulse_scraper.scrapers.adapters import ADAPTERS

MAX_BODY_BYTES = MAX_RESPONSE_BYTES
MAX_STORE_BYTES = 5 * 1024 * 1024 * 1024
MAX_FILES = 10000
RETENTION_SECONDS = 30 * 86400
PARSER_VERSION = "vacancy-parser:v1"
_COMPRESSED_BODY_PREFIX = b"JPSNPZ1\x00"
_SECRET_PARAMETERS = {"token", "key", "api_key", "access_token", "authorization", "password", "signature"}


class SnapshotBudgetExceeded(ValueError):
    """Bounded local response capture cannot accept another body or metadata file."""


def public_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
        raise ValueError("Snapshot requires an uncredentialed public URL")
    query = urlencode([(key, value) for key, value in parse_qsl(parts.query) if key.lower() not in _SECRET_PARAMETERS])
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


class SnapshotStore:
    def __init__(self, root: Path):
        if root.is_symlink() or any(parent.is_symlink() for parent in root.parents):
            raise ValueError("Snapshot root cannot be a symbolic link")
        self.root = root
        root.mkdir(parents=True, exist_ok=True, mode=0o700)

    @contextmanager
    def _lock(self):
        lock_path = self.root / ".lock"
        if lock_path.is_symlink():
            raise ValueError("Snapshot lock cannot be a symbolic link")
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

    def _purge(self) -> None:
        for path in self.root.iterdir():
            if path.name != ".lock" and not path.is_symlink() and path.is_file():
                if path.stat().st_mtime < time.time() - RETENTION_SECONDS:
                    path.unlink()

    def _path(self, key: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{64}\.(?:bin|json)", key):
            raise ValueError("Invalid snapshot key")
        path = self.root / key
        if path.is_symlink():
            raise ValueError("Snapshot cannot be a symbolic link")
        return path

    def _write(self, key: str, body: bytes) -> None:
        path = self._path(key)
        if path.exists():
            if key.endswith(".bin"):
                existing = self._decode_body(path.read_bytes())
                if existing != body:
                    raise ValueError("Snapshot body checksum mismatch")
            os.utime(path, None)
            return
        stored = body
        if key.endswith(".bin"):
            compressed = _COMPRESSED_BODY_PREFIX + gzip.compress(body, compresslevel=6, mtime=0)
            if len(compressed) < len(body):
                stored = compressed
        files = [item for item in self.root.iterdir() if item.is_file() and item.name != ".lock"]
        used_bytes = sum(item.stat().st_size for item in files)
        if len(files) >= MAX_FILES:
            raise SnapshotBudgetExceeded("Snapshot file-count budget exhausted")
        if used_bytes + len(stored) > MAX_STORE_BYTES:
            used_bytes = self._compact_bodies(len(stored), exclude=key, used_bytes=used_bytes)
        if used_bytes + len(stored) > MAX_STORE_BYTES:
            raise SnapshotBudgetExceeded("Snapshot storage budget exhausted")
        descriptor, temporary = tempfile.mkstemp(dir=self.root)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(stored)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _compact_bodies(self, required_bytes: int, *, exclude: str, used_bytes: int) -> int:
        """Compress retained raw bodies in place before rejecting a new snapshot."""
        for path in sorted(self.root.glob("*.bin"), key=lambda item: item.lstat().st_mtime):
            if path.name == exclude or path.is_symlink():
                continue
            self._path(path.name)
            raw = path.read_bytes()
            if raw.startswith(_COMPRESSED_BODY_PREFIX):
                continue
            compressed = _COMPRESSED_BODY_PREFIX + gzip.compress(raw, compresslevel=6, mtime=0)
            if len(compressed) >= len(raw):
                continue
            descriptor, temporary = tempfile.mkstemp(dir=self.root)
            try:
                with os.fdopen(descriptor, "wb") as output:
                    output.write(compressed)
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            used_bytes -= len(raw) - len(compressed)
            if used_bytes + required_bytes <= MAX_STORE_BYTES:
                return used_bytes
        return used_bytes

    @staticmethod
    def _decode_body(stored: bytes) -> bytes:
        if not stored.startswith(_COMPRESSED_BODY_PREFIX):
            return stored
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(stored[len(_COMPRESSED_BODY_PREFIX) :])) as stream:
                body = stream.read(MAX_BODY_BYTES + 1)
        except (OSError, EOFError) as error:
            raise ValueError("Snapshot compressed body is invalid") from error
        if len(body) > MAX_BODY_BYTES:
            raise ValueError("Snapshot body exceeds budget")
        return body

    def save(self, target: SourceTarget, response: FetchResponse) -> str:
        if len(response.body) > MAX_BODY_BYTES:
            raise SnapshotBudgetExceeded("Response exceeds snapshot body budget")
        body_hash = hashlib.sha256(response.body).hexdigest()
        metadata = {
            "target": {**asdict(target), "url": public_url(target.url)},
            "url": public_url(response.url),
            "status": response.status,
            "content_type": response.content_type,
            "body_hash": body_hash,
            "body_bytes": len(response.body),
            "parser_version": PARSER_VERSION,
        }
        encoded = json.dumps(metadata, sort_keys=True).encode()
        key = hashlib.sha256(encoded).hexdigest() + ".json"
        with self._lock():
            self._purge()
            self._write(body_hash + ".bin", response.body)
            self._write(key, encoded)
        return key

    def replay(self, key: str) -> list[RawJob]:
        with self._lock():
            return self._replay(key)

    def _replay(self, key: str) -> list[RawJob]:
        metadata_path = self._path(key)
        if metadata_path.stat().st_size > 16384:
            raise ValueError("Snapshot metadata exceeds budget")
        encoded = metadata_path.read_bytes()
        if hashlib.sha256(encoded).hexdigest() + ".json" != key:
            raise ValueError("Snapshot metadata checksum mismatch")
        metadata = json.loads(encoded)
        if metadata["parser_version"] != PARSER_VERSION:
            raise ValueError("Unsupported snapshot parser version")
        target = SourceTarget(**metadata["target"])
        body_path = self._path(metadata["body_hash"] + ".bin")
        if body_path.stat().st_size > MAX_BODY_BYTES:
            raise ValueError("Snapshot body exceeds budget")
        body = self._decode_body(body_path.read_bytes())
        if hashlib.sha256(body).hexdigest() != metadata["body_hash"] or len(body) != metadata["body_bytes"]:
            raise ValueError("Snapshot checksum mismatch")
        response = FetchResponse(metadata["url"], metadata["status"], body, metadata["content_type"])
        return ADAPTERS[target.provider].parser(target, response)
