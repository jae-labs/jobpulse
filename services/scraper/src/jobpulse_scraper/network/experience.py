"""Bounded source learning and per-run public acquisition measurements."""

from __future__ import annotations

import hashlib
import json
import sys
import time
import uuid
from collections.abc import Mapping, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any
from urllib.parse import urlsplit

from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.network.ledger import RequestLedger, source_key

run_key: ContextVar[str] = ContextVar("request_run", default="")


def run_identity(task_id: str, lease_token: str) -> str:
    """Correlate diagnostics without exporting the credential that fences writes."""
    return hashlib.sha256((task_id + ":" + lease_token).encode()).hexdigest()[:32]


def ledger() -> RequestLedger:
    from jobpulse_scraper.network.request_policy import STATE_PATH

    return RequestLedger(STATE_PATH.with_suffix(".sqlite3"))


@contextmanager
def measured_stage(stage: str):
    """Record bounded stage durations without job contents or request URLs."""
    started = time.monotonic()
    try:
        yield
    finally:
        event("stage_finished", data={"stage": stage, "elapsed_seconds": round(time.monotonic() - started, 4)})


def identity(company: str, url: str) -> str:
    return hashlib.sha256((company.casefold() + "\n" + url).encode()).hexdigest()


@contextmanager
def source_scope(company: str, url: str):
    """Synchronous entry points retain source attribution without nesting durable runs."""
    if run_key.get():
        yield
        return
    run = uuid.uuid4().hex
    run_token = run_key.set(run)
    source_token = source_key.set(identity(company, url))
    started = time.monotonic()
    try:
        event("source_measurement_start", data={"company": company[:120]})
        yield
    finally:
        try:
            event(
                "source_measurement_finished",
                data={
                    "company": company[:120],
                    "metrics": run_metrics(run, time.monotonic() - started),
                },
            )
        finally:
            run_key.reset(run_token)
            source_key.reset(source_token)


def event(
    kind: str,
    host: str = "",
    *,
    transport: str = "http",
    resource: str = "document",
    status: int | None = None,
    run: str | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    now = time.time()
    host = host.rsplit("@", 1)[-1][:255]
    record = {
        "run_id": run_key.get() if run is None else run,
        "host": host,
        "transport": transport,
        "resource": resource,
        "status": status,
        **(data or {}),
    }
    with ledger().transaction() as connection:
        if kind == "response_received" and (status in {401, 403, 429} or record.get("content_challenge")):
            record["host_requests_in_previous_minute"] = connection.execute(
                "SELECT count(*) FROM measurements WHERE kind='request_sent' "
                "AND json_extract(data,'$.host')=? AND at BETWEEN ? AND ?",
                (host, now - 60, now),
            ).fetchone()[0]
        connection.execute(
            "INSERT INTO measurements(source,run,at,kind,data) VALUES(?,?,?,?,?)",
            (source_key.get(), record["run_id"], now, kind, json.dumps(record)),
        )
        connection.execute(
            "DELETE FROM measurements WHERE at<? OR id <= (SELECT coalesce(max(id),0)-50000 FROM measurements)",
            (now - 30 * 86400,),
        )
    print(json.dumps({"time": now, "crawl_event": kind, **record}), file=sys.stderr, flush=True)


def preferred_transport(company: str, url: str) -> str:
    with ledger().transaction() as connection:
        row = connection.execute(
            "SELECT transport,verified_at,failures FROM source_profiles WHERE identity=?", (identity(company, url),)
        ).fetchone()
    return "browser" if row and row[0] == "browser" and row[1] > time.time() - 7 * 86400 and row[2] < 3 else "http"


def preferred_route(company: str, url: str) -> str:
    """Reuse a positively extracted public destination for seven days."""
    with ledger().transaction() as connection:
        row = connection.execute(
            "SELECT url FROM source_routes WHERE identity=? AND verified_at>?",
            (identity(company, url), time.time() - 7 * 86400),
        ).fetchone()
    return row[0] if row else url


def remember_route(company: str, url: str, destination: str, *, success: bool) -> None:
    key = identity(company, url)
    parts = urlsplit(destination)
    with ledger().transaction() as connection:
        if not success:
            connection.execute("DELETE FROM source_routes WHERE identity=?", (key,))
        elif (
            parts.scheme in {"http", "https"}
            and parts.hostname
            and not parts.username
            and not parts.password
            and not parts.query
            and not parts.fragment
        ):
            connection.execute(
                "INSERT INTO source_routes(identity,url,verified_at) VALUES(?,?,?) "
                "ON CONFLICT(identity) DO UPDATE SET url=excluded.url,verified_at=excluded.verified_at",
                (key, destination, time.time()),
            )
        connection.execute(
            "DELETE FROM source_routes WHERE verified_at<? OR identity NOT IN "
            "(SELECT identity FROM source_routes ORDER BY verified_at DESC LIMIT 10000)",
            (time.time() - 30 * 86400,),
        )


def remember_transport(company: str, url: str, transport: str, *, success: bool) -> None:
    if transport not in {"http", "browser"}:
        raise ValueError("Unsupported learned transport")
    key, now = identity(company, url), time.time()
    with ledger().transaction() as connection:
        if success:
            connection.execute(
                "INSERT INTO source_profiles(identity,transport,verified_at,failures) VALUES(?,?,?,0) "
                "ON CONFLICT(identity) DO UPDATE SET transport=excluded.transport,verified_at=CASE "
                "WHEN source_profiles.transport=excluded.transport AND source_profiles.failures<3 "
                "AND source_profiles.verified_at>? THEN source_profiles.verified_at "
                "ELSE excluded.verified_at END,failures=0",
                (key, transport, now, now - 7 * 86400),
            )
        else:
            connection.execute("UPDATE source_profiles SET failures=failures+1 WHERE identity=?", (key,))
        connection.execute(
            "DELETE FROM source_profiles WHERE verified_at<? OR identity NOT IN "
            "(SELECT identity FROM source_profiles ORDER BY verified_at DESC LIMIT 10000)",
            (now - 30 * 86400,),
        )
        row = connection.execute("SELECT verified_at FROM source_profiles WHERE identity=?", (key,)).fetchone()
        verified_at = row[0] if row else now
    event(
        "transport_outcome", transport=transport, data={"identity": key, "success": success, "verified_at": verified_at}
    )


def restore_profile(company: str, url: str, profile: object) -> None:
    """Restore only a recent positive observation for this exact configured source."""
    if not isinstance(profile, dict) or profile.get("identity") != identity(company, url):
        return
    verified, transport = profile.get("verified_at"), profile.get("transport")
    if not isinstance(verified, (int, float)) or not time.time() - 7 * 86400 < verified <= time.time():
        return
    if profile.get("success") is not True or transport not in {"http", "browser"}:
        return
    with ledger().transaction() as connection:
        connection.execute(
            "INSERT INTO source_profiles(identity,transport,verified_at,failures) VALUES(?,?,?,0) "
            "ON CONFLICT(identity) DO UPDATE SET transport=excluded.transport,verified_at=excluded.verified_at "
            "WHERE source_profiles.verified_at<excluded.verified_at",
            (identity(company, url), transport, verified),
        )


def measure_quality(records: Sequence[Mapping[str, Any]]) -> None:
    counts = {"opportunities_assessed": len(records)}
    for field in ("title", "url", "location", "employment_type", "salary_text"):
        counts[field + "_present"] = sum(
            str(row.get(field) or "").strip().lower() not in {"", "see job post", "unknown", "not specified"}
            for row in records
        )
    counts["description_body_present"] = sum(has_description_body(str(row.get("description") or "")) for row in records)
    event("quality_assessed", data=counts)


def run_metrics(run: str, elapsed: float) -> dict[str, Any]:
    """Count sent attempts separately from replies and local denials; retain bounded host detail."""
    with ledger().transaction() as connection:
        rows = connection.execute("SELECT at,kind,data FROM measurements WHERE run=? ORDER BY id", (run,)).fetchall()
        policies = {
            host: (interval, cooldown)
            for host, interval, cooldown in connection.execute("SELECT host,interval,cooldown FROM hosts")
        }
    sent = replies = denied = 0
    hosts: dict[str, dict[str, Any]] = {}
    quality: dict[str, int] = {}
    transports: dict[str, int] = {}
    resources: dict[str, int] = {}
    profile = None
    skipped = 0
    stages: dict[str, float] = {}
    for at, kind, raw in rows:
        data = json.loads(raw)
        host = data["host"]
        if kind in {"request_sent", "response_received"}:
            group = hosts.setdefault(host, {"host": host, "requests_sent": 0, "responses": 0, "denials": 0})
            if kind == "request_sent":
                sent += 1
                group["requests_sent"] += 1
                transport = data["transport"]
                transports[transport] = transports.get(transport, 0) + 1
                resource = data["resource"]
                resources[resource] = resources.get(resource, 0) + 1
            else:
                replies += 1
                group["responses"] += 1
                if data["status"] in {401, 403, 429} or data.get("content_challenge"):
                    denied += 1
                    group["denials"] += 1
                    group["latest_denial"] = {
                        "status": data["status"],
                        "content_challenge": bool(data.get("content_challenge")),
                        "observed_at": at,
                        "requests_sent_before_denial": group["requests_sent"],
                        "retry_after_seconds": data.get("retry_after_seconds", 0),
                        "host_requests_in_previous_minute": data.get("host_requests_in_previous_minute", 0),
                    }
        elif kind == "quality_assessed":
            for key, value in data.items():
                if key.endswith("_present") or key == "opportunities_assessed":
                    quality[key] = quality.get(key, 0) + value
        elif kind == "transport_outcome":
            profile = data
        elif kind == "cooldown_skipped":
            skipped += 1
        elif kind == "stage_finished":
            stage = data["stage"]
            stages[stage] = round(stages.get(stage, 0) + data["elapsed_seconds"], 4)
    for group in hosts.values():
        group["requests_per_second"] = round(group["requests_sent"] / max(elapsed, 0.001), 4)
        group["learned_interval_seconds"], group["cooldown_until"] = policies.get(group["host"], (0, 0))
    return {
        "schema_version": 1,
        "stage_seconds": stages,
        "run_id": run,
        "elapsed_seconds": round(elapsed, 3),
        "requests_sent": sent,
        "responses": replies,
        "cooldown_skips": skipped,
        "denials": denied,
        "requests_per_second": round(sent / max(elapsed, 0.001), 4),
        "transport_requests": transports,
        "resource_requests": resources,
        "hosts": list(hosts.values())[:16],
        "hosts_truncated": len(hosts) > 16,
        "quality": quality,
        "quality_stage": "ingestion_input",
        "source_profile": profile,
        "coverage": "bounded_observations",
        "quota_established": False,
    }
