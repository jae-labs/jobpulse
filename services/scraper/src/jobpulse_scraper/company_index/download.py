"""Atomic public snapshot downloads with a process-safe import lock."""

from __future__ import annotations

import fcntl
import json
import os
import re
import threading
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path

import httpx

from jobpulse_scraper.company_index.importers import CRO_URL, MAX_DOWNLOAD


def event(name: str, **fields) -> None:
    print(json.dumps({"event": name, **fields}), flush=True)


@contextmanager
def index_lock(root: Path):
    root.mkdir(parents=True, exist_ok=True)
    with (root / "import.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def download_cro(root: Path) -> Path:
    target = root / "companies.csv.zip"
    temporary = root / f"companies.{os.getpid()}.partial"
    last = time.monotonic()
    size = 0
    try:
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            with client.stream("GET", CRO_URL, params={"download": str(time.time_ns())}) as response:
                response.raise_for_status()
                with temporary.open("wb") as stream:
                    for block in response.iter_bytes(1024 * 1024):
                        size += len(block)
                        if size > MAX_DOWNLOAD:
                            raise ValueError("CRO download exceeds 512 MiB")
                        stream.write(block)
                        if time.monotonic() - last >= 10:
                            event("cro_download", bytes=size)
                            last = time.monotonic()
        with zipfile.ZipFile(temporary) as archive:
            members = archive.infolist()
            if len(members) != 1 or members[0].file_size > 2 * 1024**3:
                raise ValueError("CRO archive exceeds uncompressed bounds")
            if archive.testzip() is not None:
                raise ValueError("CRO ZIP checksum failure")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    event("cro_download_complete", bytes=size)
    return target


def download_overture(root: Path, release: str) -> Path:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", release):
        raise ValueError("Overture release must have YYYY-MM-DD.N format")
    import duckdb

    target = root / "overture-ireland.jsonl"
    temporary = root / f"overture.{os.getpid()}.partial"
    started = time.monotonic()
    event("overture_download_started", release=release)
    try:
        with duckdb.connect() as connection:
            connection.execute("SET memory_limit='1GB'")
            connection.execute("SET threads=4")
            connection.execute("SET temp_directory=?", [str(root / "duckdb-tmp")])
            connection.execute("INSTALL httpfs; LOAD httpfs")
            connection.execute("SET s3_region='us-west-2'")
            connection.execute("SET http_timeout=60")
            stop = threading.Event()

            def monitor():
                while not stop.wait(15):
                    event(
                        "overture_download_progress",
                        elapsed_seconds=round(time.monotonic() - started),
                        bytes=temporary.stat().st_size if temporary.exists() else 0,
                    )
                    if time.monotonic() - started > 900:
                        connection.interrupt()
                        return

            heartbeat = threading.Thread(target=monitor, daemon=True)
            heartbeat.start()
            try:
                result = connection.execute(
                    """
                    SELECT id, names.primary AS name, bbox.ymin AS latitude, bbox.xmin AS longitude,
                        addresses, websites, confidence, operating_status, sources, basic_category, taxonomy
                    FROM read_parquet(?, hive_partitioning=true)
                    WHERE bbox.xmin BETWEEN -10.8 AND -5.3 AND bbox.ymin BETWEEN 51.3 AND 55.5
                        AND names.primary IS NOT NULL
                """,
                    [f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"],
                )
                names = [column[0] for column in result.description]
                size = 0
                with temporary.open("w", encoding="utf-8") as stream:
                    while rows := result.fetchmany(1000):
                        if time.monotonic() - started > 900:
                            raise TimeoutError("Overture query exceeds fifteen-minute budget")
                        for row in rows:
                            line = json.dumps(dict(zip(names, row, strict=True)), ensure_ascii=False) + "\n"
                            size += len(line.encode("utf-8"))
                            if size > MAX_DOWNLOAD:
                                raise ValueError("Regional Overture download exceeds 512 MiB")
                            stream.write(line)
            finally:
                stop.set()
                heartbeat.join()
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    event(
        "overture_download_complete", bytes=target.stat().st_size, elapsed_seconds=round(time.monotonic() - started, 2)
    )
    return target
