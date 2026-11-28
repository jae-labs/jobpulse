"""Stream public CRO and regional Overture snapshots without extracting ZIP paths."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import zipfile
from collections.abc import Iterator
from pathlib import Path

from jobpulse_scraper.company_index.store import Place

CRO_URL = "https://opendata.cro.ie/dataset/bf6f837d-0946-4c14-9a99-82cd6980c121/resource/3fef41bc-b8f4-4b10-8434-ce51c29b1bba/download/companies.csv.zip"
CRO_ATTRIBUTION = "Contains Irish Public Sector Data licensed under CC BY 4.0; Companies Registration Office; https://opendata.cro.ie/dataset/companies"
OVERTURE_ATTRIBUTION = "Overture Maps Foundation and upstream sources; retain per-record sources; https://docs.overturemaps.org/attribution/"
MAX_DOWNLOAD = 512 * 1024 * 1024


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def cro_rows(path: Path) -> Iterator[Place]:
    with zipfile.ZipFile(path) as archive:
        files = [f for f in archive.infolist() if f.filename.casefold().endswith(".csv")]
        if len(files) != 1 or files[0].file_size > 2 * 1024**3:
            raise ValueError("CRO snapshot requires one bounded CSV member")
        with archive.open(files[0]) as raw, io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if not {"company_num", "company_name", "company_status"} <= set(reader.fieldnames or []):
                raise ValueError("Unsupported CRO CSV schema")
            for row in reader:
                address = ", ".join(
                    row.get(f"company_address_{i}", "").strip()
                    for i in range(1, 5)
                    if row.get(f"company_address_{i}", "").strip()
                )
                yield Place(
                    source="cro",
                    identity=row["company_num"]
                    + ":"
                    + hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest(),
                    company_number=row["company_num"],
                    name=row["company_name"],
                    kind="registered_address",
                    address=address,
                    country="IE",
                    status=row["company_status"],
                    evidence=json.dumps(
                        {
                            "eircode": row.get("eircode"),
                            "nace_v2_code": row.get("nace_v2_code"),
                            "status_date": row.get("company_status_date"),
                            "dissolved_date": row.get("comp_dissolved_date"),
                        }
                    ),
                )


def overture_rows(path: Path) -> Iterator[Place]:
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if len(line) > 1024 * 1024:
                raise ValueError("Overture record exceeds 1 MiB")
            row = json.loads(line)
            lat, lon = row["latitude"], row["longitude"]
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (lat, lon)):
                raise ValueError("Invalid Overture coordinates")
            if not 51.3 <= lat <= 55.5 or not -10.8 <= lon <= -5.3:
                raise ValueError("Overture coordinate outside the Irish regional extract")
            addresses = row.get("addresses") or []
            countries = {a.get("country") for a in addresses if a.get("country")}
            if countries and "IE" not in countries:
                continue
            address = next((a for a in addresses if a.get("country") == "IE"), addresses[0] if addresses else {})
            yield Place(
                source="overture",
                identity=row["id"],
                name=row["name"],
                kind="operating_place_candidate",
                address=address.get("freeform", ""),
                city=address.get("locality", ""),
                country=address.get("country", ""),
                websites=tuple(row.get("websites") or []),
                latitude=lat,
                longitude=lon,
                confidence=row.get("confidence"),
                status=row.get("operating_status") or "unknown",
                evidence=json.dumps(row.get("sources") or [], ensure_ascii=False),
                category=row.get("basic_category") or "",
                taxonomy=json.dumps(row.get("taxonomy") or {}),
            )
