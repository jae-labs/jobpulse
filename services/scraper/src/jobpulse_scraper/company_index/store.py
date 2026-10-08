"""Transactional snapshot replacement and indexed, evidence-preserving candidates."""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit


def name_key(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = " ".join(re.sub(r"[\W_]+", " ", text).split())
    return re.sub(r"(?:\s+(?:limited|ltd|plc|dac|inc|llc))+$", "", text)


def domain(value: str) -> str:
    try:
        parsed = urlsplit(value if "://" in value else "https://" + value)
        host = parsed.hostname or ""
        if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
            return ""
        host = host.casefold().removeprefix("www.")
        shared = {"facebook.com", "linkedin.com", "instagram.com", "twitter.com", "x.com", "google.com"}
        return host if "." in host and host not in shared else ""
    except ValueError:
        return ""


@dataclass(frozen=True)
class Place:
    source: str
    identity: str
    name: str
    kind: str
    address: str
    city: str = ""
    country: str = ""
    websites: tuple[str, ...] = ()
    latitude: float | None = None
    longitude: float | None = None
    confidence: float | None = None
    status: str = ""
    evidence: str = ""
    company_number: str = ""
    category: str = ""
    taxonomy: str = ""


class CompanyIndex:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, timeout=30)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS snapshots (
                source TEXT PRIMARY KEY, version TEXT NOT NULL, attribution TEXT NOT NULL,
                sha256 TEXT NOT NULL, imported_at TEXT NOT NULL, records INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS places (
                source TEXT NOT NULL, identity TEXT NOT NULL, name_key TEXT NOT NULL,
                payload TEXT NOT NULL, PRIMARY KEY(source, identity)
            );
            CREATE INDEX IF NOT EXISTS places_name ON places(name_key);
            CREATE INDEX IF NOT EXISTS places_number ON places(json_extract(payload, '$.company_number'));
            CREATE TABLE IF NOT EXISTS domains (
                source TEXT NOT NULL, identity TEXT NOT NULL, domain TEXT NOT NULL,
                PRIMARY KEY(source, identity, domain)
            );
            CREATE INDEX IF NOT EXISTS places_domain ON domains(domain);
        """)

    def close(self) -> None:
        self.connection.close()

    def replace(self, source: str, rows: Iterable[Place], *, version: str, attribution: str, sha256: str) -> int:
        """One transaction preserves the previous snapshot on validation/interruption failures."""
        count = 0
        with self.connection:
            self.connection.execute("DELETE FROM domains WHERE source=?", (source,))
            self.connection.execute("DELETE FROM places WHERE source=?", (source,))
            for row in rows:
                if row.source != source or not row.identity or not row.name or not name_key(row.name):
                    raise ValueError("Snapshot row requires source, identity and company name")
                self.connection.execute(
                    "INSERT INTO places VALUES (?,?,?,?)",
                    (
                        source,
                        row.identity,
                        name_key(row.name),
                        json.dumps(asdict(row), ensure_ascii=False),
                    ),
                )
                for host in {domain(w) for w in row.websites} - {""}:
                    self.connection.execute("INSERT INTO domains VALUES (?,?,?)", (source, row.identity, host))
                count += 1
            if not count:
                raise ValueError("Empty snapshot cannot replace a populated index")
            self.connection.execute(
                "INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?,?,?)",
                (
                    source,
                    version,
                    attribution,
                    sha256,
                    datetime.now(UTC).isoformat(),
                    count,
                ),
            )
        return count

    def match(self, name: str, website: str = "", company_number: str = "") -> dict:
        host = domain(website)
        rows = self.connection.execute(
            """
            SELECT payload FROM places WHERE name_key=?
            UNION
            SELECT p.payload FROM places p JOIN domains d
                ON p.source=d.source AND p.identity=d.identity WHERE d.domain=? AND ?<>''
            UNION
            SELECT payload FROM places WHERE source='cro'
                AND json_extract(payload, '$.company_number')=? AND ?<>''
            LIMIT 101
        """,
            (name_key(name), host, host, company_number, company_number),
        ).fetchall()
        candidates = []
        for row in rows:
            item = json.loads(row[0])
            reasons = []
            if item["source"] == "cro" and company_number and item["company_number"] == company_number:
                reasons.append("company_number")
            if host and host in {domain(w) for w in item["websites"]}:
                reasons.append("website_domain")
            if name_key(item["name"]) == name_key(name):
                reasons.append("normalized_name")
            conflicting_domain = bool(host and item["websites"] and "website_domain" not in reasons)
            closed = item["status"].casefold() in {"closed", "permanently_closed", "dissolved"}
            item.update(match_reasons=reasons, domain_conflict=conflicting_domain, closed=closed, review_required=True)
            candidates.append(item)
        strong = [
            c
            for c in candidates
            if not c["domain_conflict"]
            and not c["closed"]
            and ("website_domain" in c["match_reasons"] or "company_number" in c["match_reasons"])
        ]
        if len([c for c in candidates if c["source"] == "cro" and "company_number" in c["match_reasons"]]) > 1:
            strong = []
        return {
            "name": name,
            "website": website,
            "status": "truncated"
            if len(rows) > 100
            else "identity_supported"
            if strong
            else "review"
            if candidates
            else "unmatched",
            "candidates": candidates[:100],
            "automatic_office_writes": 0,
        }

    def metadata(self) -> list[dict]:
        return [dict(row) for row in self.connection.execute("SELECT * FROM snapshots ORDER BY source")]
