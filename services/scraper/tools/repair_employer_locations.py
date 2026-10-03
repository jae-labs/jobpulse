"""Restore proven HQ substitutions from the pre-enrichment public catalog snapshot.

Only reads public.jobs COPY records. Dry run by default; --apply uses guarded writes
and the existing vector/hash refresh path. Never imports private snapshot tables.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase, retry_supabase
from database.embeddings import prepare_embeddings
from database.records import response_records
from engine.text_cleaner import normalize_location


def read_catalog_snapshot(path: Path) -> dict[int, dict[str, str | None]]:
    columns = None
    jobs = {}
    escapes = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\"}
    with path.open() as stream:
        for line in stream:
            if columns is None:
                match = re.match(r'COPY (?:"public"\."jobs"|public\.jobs) \((.+)\) FROM stdin;', line)
                if match:
                    columns = [name.strip().strip('"') for name in match[1].split(",")]
                    if not {"id", "dedupe_key", "company", "url", "location"}.issubset(columns):
                        raise ValueError("Snapshot lacks catalog identity fields")
                continue
            if line.rstrip("\n") == r"\.":
                return jobs
            values = line.rstrip("\n").split("\t")
            if len(values) != len(columns):
                raise ValueError("Invalid jobs COPY row")
            row = dict(zip(columns, values, strict=True))
            jobs[int(row["id"])] = {
                key: None if row[key] == r"\N" else re.sub(r"\\([nrt\\])", lambda m: escapes[m[1]], row[key])
                for key in ("dedupe_key", "company", "url", "location")
            }
    raise ValueError("Missing or incomplete public.jobs section")


def restoration_location(
    job: dict[str, Any], baseline: Mapping[str, str | None], employer: dict[str, Any]
) -> str | None:
    if any(job.get(key) != baseline[key] for key in ("dedupe_key", "company", "url")):
        return None
    original = normalize_location(baseline.get("location") or "")
    if original not in {"Ireland", "Ireland (Hybrid)", "Ireland (Remote)", "Ireland (On-site)"}:
        return None
    current = job.get("location") or ""
    headquarters = employer.get("location") or ""
    if not headquarters or current == original:
        return None
    if current not in {headquarters, *(f"{headquarters} ({mode})" for mode in ("Hybrid", "Remote", "On-site"))}:
        return None
    return original


def repair_locations(snapshot: Path, report: Path, *, apply: bool = False) -> dict[str, int]:
    baseline = read_catalog_snapshot(snapshot)
    client = get_supabase()
    counts = {"scanned": 0, "proposed": 0, "updated": 0, "conflicts": 0}
    cursor = 0
    with report.open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=["id", "old_location", "restored_location", "outcome"])
        writer.writeheader()
        while True:
            rows = response_records(
                retry_supabase(
                    lambda c=cursor: (
                        client.table("jobs")
                        .select("*,employers(location)")
                        .gt("id", c)
                        .order("id")
                        .limit(100)
                        .execute()
                    )
                ).data
            )
            if not rows:
                break
            cursor = rows[-1]["id"]
            counts["scanned"] += len(rows)
            refresh = []
            for job in rows:
                original = baseline.get(job["id"])
                if not original:
                    continue
                restored = restoration_location(job, original, job.get("employers") or {})
                # A retry after unavailable inference also refreshes already restored vectors.
                same_identity = all(job.get(key) == original[key] for key in ("dedupe_key", "company", "url"))
                if (
                    apply
                    and same_identity
                    and job.get("location") == normalize_location(original.get("location") or "")
                ):
                    refresh.append({key: value for key, value in job.items() if key != "employers"})
                if restored is None:
                    continue
                counts["proposed"] += 1
                outcome = "would_restore"
                if apply:
                    saved = response_records(
                        retry_supabase(
                            lambda j=job, loc=restored: (
                                client.table("jobs")
                                .update({"location": loc})
                                .eq("id", j["id"])
                                .eq("dedupe_key", j["dedupe_key"])
                                .eq("company", j["company"])
                                .eq("url", j["url"])
                                .eq("location", j["location"])
                                .execute()
                            )
                        ).data
                    )
                    counts["updated"] += len(saved)
                    counts["conflicts"] += not bool(saved)
                    refresh.extend(saved)
                    outcome = "restored" if saved else "concurrent_change"
                writer.writerow(
                    {
                        "id": job["id"],
                        "old_location": job["location"],
                        "restored_location": restored,
                        "outcome": outcome,
                    }
                )
            if refresh:
                prepare_embeddings(refresh)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(repair_locations(args.snapshot, args.report, apply=args.apply))


if __name__ == "__main__":
    main()
