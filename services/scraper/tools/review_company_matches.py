"""Compare exact company candidates through agy; evidence proposals only, no apply mode."""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import Counter
from pathlib import Path

from jobpulse_scraper.company_index.download import event, index_lock
from jobpulse_scraper.company_index.evidence import EvidenceFetcher, EvidenceProvider, failure_category
from jobpulse_scraper.company_index.review import PROMPT_VERSION, AgyReviewer, comparison_pair
from jobpulse_scraper.company_index.store import CompanyIndex, domain, name_key
from jobpulse_scraper.local_data import prepare_company_root
from jobpulse_scraper.paths import COMPANY_INDEX_ROOT
from jobpulse_scraper.pipeline.research_progress import progress
from jobpulse_scraper.pipeline.research_provider import add_provider_arguments, resolve_provider_arguments


def public_employers(path: Path | None, limit: int) -> list[dict]:
    if path:
        raw = json.loads(path.read_text(encoding="utf-8"))
    else:
        from jobpulse_scraper.database.client import get_supabase, retry_supabase
        from jobpulse_scraper.database.records import response_records

        client = get_supabase()
        raw = []
        cursor = 0
        while len(raw) < limit:
            rows = response_records(
                retry_supabase(
                    lambda cursor=cursor: (
                        client.table("employers")
                        .select("id,name,website")
                        .order("id")
                        .gt("id", cursor)
                        .limit(min(100, limit - len(raw)))
                        .execute()
                    )
                ).data
            )
            if not rows:
                break
            raw.extend(rows)
            cursor = rows[-1]["id"]
    if not isinstance(raw, list):
        raise ValueError("Public employers must be a JSON list")
    result = []
    seen = set()
    for row in raw[:limit]:
        if (
            not isinstance(row, dict)
            or type(row.get("id")) is not int
            or row["id"] <= 0
            or not isinstance(row.get("name"), str)
            or not 1 <= len(row["name"]) <= 256
            or not name_key(row["name"])
            or row["id"] in seen
        ):
            raise ValueError("Public employer requires a unique positive ID and bounded name")
        seen.add(row["id"])
        website, number = row.get("website") or "", row.get("company_number") or ""
        if not isinstance(website, str) or len(website) > 2048 or not isinstance(number, (str, int)):
            raise ValueError("Invalid public employer website or company number")
        result.append({"id": row["id"], "name": row["name"], "website": website, "company_number": str(number)})
    return result


def alias_records(path: Path | None) -> dict[int, list[dict]]:
    if path is None:
        return {}
    if path.stat().st_size > 1024**2:
        raise ValueError("Alias input exceeds 1 MiB")
    rows = json.loads(path.read_text())
    if not isinstance(rows, list):
        raise ValueError("Alias witnesses must be a list")
    result: dict[int, list[dict]] = {}
    for row in rows:
        if (
            not isinstance(row, dict)
            or set(row) != {"employer_id", "url", "aliases"}
            or type(row["employer_id"]) is not int
            or not isinstance(row["url"], str)
            or not isinstance(row["aliases"], list)
            or not 1 <= len(row["aliases"]) <= 3
            or any(not isinstance(a, str) or not 4 <= len(a) <= 256 for a in row["aliases"])
        ):
            raise ValueError("Alias witness requires employer_id, public source URL and 1–3 bounded aliases")
        result.setdefault(row["employer_id"], []).append(row)
        if len(result[row["employer_id"]]) > 1:
            raise ValueError("Supply at most one alias witness page per employer")
    return result


def gather(index: CompanyIndex, employer: dict, fetcher: EvidenceProvider | None, aliases: list[dict]) -> dict:
    match = index.match(employer["name"], employer["website"], employer["company_number"])
    candidates = {(c["source"], c["identity"]): c for c in match["candidates"]}
    witnesses = []
    errors = []
    rejected_aliases = []
    host = domain(employer["website"])
    urls = list(dict.fromkeys([employer["website"], *[a["url"] for a in aliases]]))[:2]
    if fetcher and host:
        for url in urls:
            try:
                witness = fetcher.fetch(url, host)
                witnesses.append(witness)
                if len(urls) == 1 and not aliases and witness.get("identity_links"):
                    urls.append(witness["identity_links"][0])
                for alias_record in aliases:
                    if alias_record["url"] != url:
                        continue
                    for alias in alias_record["aliases"]:
                        if " " + name_key(alias) + " " not in " " + name_key(witness["text"]) + " ":
                            rejected_aliases.append(alias)
                            continue
                        alias_match = index.match(alias)
                        for candidate in alias_match["candidates"]:
                            candidates[(candidate["source"], candidate["identity"])] = candidate
                        if alias_match["status"] == "truncated":
                            match["status"] = "truncated"
            except Exception as exc:
                # Report only the error category; public response text/URLs stay out of diagnostics.
                errors.append(failure_category(exc))
    elif aliases:
        rejected_aliases.extend(a for row in aliases for a in row["aliases"])
    values = sorted(candidates.values(), key=lambda c: (c["source"], c["identity"]))
    return {
        "employer_id": employer["id"],
        "name": employer["name"],
        "witnesses": witnesses,
        "candidates": values[:10],
        "candidate_search_truncated": match["status"] == "truncated" or len(values) > 10,
        "evidence_failures": errors,
        "rejected_aliases": rejected_aliases,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=COMPANY_INDEX_ROOT)
    parser.add_argument("--employers", type=Path, help="Public employer JSON; otherwise read configured catalog")
    parser.add_argument(
        "--aliases", type=Path, help="First-party alias source URLs; aliases must occur in fetched text"
    )
    parser.add_argument("--limit", type=int, default=20, help="Total employer budget (1–10000)")
    parser.add_argument("--report", type=Path, help="Identity report and journal destination")
    add_provider_arguments(parser)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--no-fetch", action="store_true", help="Use snapshot facts only; no first-party HTTP")
    args = parser.parse_args()
    try:
        resolve_provider_arguments(args)
    except ValueError as exc:
        parser.error(str(exc))
    if not 1 <= args.limit <= 10000 or not 1 <= args.timeout <= 300:
        parser.error("limit must be 1–10000 and timeout 1–300")
    prepare_company_root(args.root)
    started = time.monotonic()
    employers = public_employers(args.employers, args.limit)
    if not employers:
        raise ValueError("No public employers selected for comparison")
    aliases = alias_records(args.aliases)
    with index_lock(args.root):
        index = CompanyIndex(args.root / "companies.sqlite3")
        try:
            if not index.metadata():
                raise ValueError("Download snapshots before comparison")
            reviewer = AgyReviewer(
                args.root / "identity-reviews",
                model=args.model,
                timeout=args.timeout,
                **(
                    {"provider": args.provider, "fallback_model": args.fallback_model, "allow_paid": args.allow_paid}
                    if args.provider != "agy"
                    else {}
                ),
            )
            fetcher = None if args.no_fetch else EvidenceFetcher(args.root / "first-party-evidence")
            records = []
            report_path = args.report or args.root / "identity-review.json"
            report_path.parent.mkdir(parents=True, exist_ok=True)
            failures = 0
            report: dict = {}
            journal_path = report_path.with_suffix(".jsonl")
            journal_path.write_text("", encoding="utf-8")
            initial = report_path.with_suffix(".partial")
            initial.write_text(json.dumps({"completed": False, "checked": 0, "results": []}), encoding="utf-8")
            initial.replace(report_path)
            decision_counts: Counter[str] = Counter()
            for employer in employers:
                with progress("first_party_evidence", employer_id=employer["id"], name=employer["name"]):
                    record = gather(index, employer, fetcher, aliases.get(employer["id"], []))
                pairs = [
                    comparison_pair(employer, candidate, record["witnesses"]) for candidate in record["candidates"]
                ]
                try:
                    with progress("identity_review", employer_id=employer["id"], candidates=len(pairs)):
                        record["decisions"] = reviewer.compare(pairs) if pairs else []
                    record["status"] = "review_required" if pairs else "no_candidates"
                except Exception as exc:
                    record.update(status="provider_failed", error_category=failure_category(exc), decisions=[])
                    failures += 1
                records.append(record)
                decision_counts.update(d["decision"] for d in record["decisions"])
                with journal_path.open("a", encoding="utf-8") as journal:
                    journal.write(json.dumps(record) + "\n")
                    journal.flush()
                    os.fsync(journal.fileno())
                report = {
                    "prompt_version": PROMPT_VERSION,
                    "model": args.model,
                    "provider": args.provider,
                    "provider_runs": getattr(reviewer, "provider_runs", []),
                    "snapshots": index.metadata(),
                    "checked": len(records),
                    "total": len(employers),
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "automatic_writes": 0,
                    "provider_calls": reviewer.calls,
                    "cache_hits": reviewer.cache_hits,
                    "public_requests": fetcher.requests if fetcher else 0,
                    "decision_counts": dict(decision_counts),
                    "completed": len(records) == len(employers),
                    "provider_failed": failures,
                    "results": records,
                }
                progress_path = report_path.with_name(report_path.stem + "-progress.json")
                temporary = progress_path.with_suffix(".partial")
                temporary.write_text(
                    json.dumps(
                        {k: v for k, v in report.items() if k != "results"}
                        | {"completed": False, "journal": str(journal_path)}
                    ),
                    encoding="utf-8",
                )
                temporary.replace(progress_path)
                event(
                    "company_review_progress",
                    checked=len(records),
                    total=len(employers),
                    provider_calls=reviewer.calls,
                    cache_hits=reviewer.cache_hits,
                    failures=failures,
                )
                if failures >= 3:
                    break
            temporary = report_path.with_suffix(".partial")
            with temporary.open("w", encoding="utf-8") as stream:
                json.dump(report, stream, indent=2)
            temporary.replace(report_path)
            event("company_review_complete", checked=len(records), provider_failed=failures, report=str(report_path))
            if failures:
                raise SystemExit(1)
        finally:
            index.close()


if __name__ == "__main__":
    main()
