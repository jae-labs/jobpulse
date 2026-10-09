"""Research a shared public employer cohort; archive proposals without catalog writes."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.paths import REPO_ROOT, SERVICE_ROOT
from jobpulse_scraper.pipeline.company_campaign import run_stage
from jobpulse_scraper.pipeline.research_progress import event, progress
from jobpulse_scraper.pipeline.research_provider import add_provider_arguments, resolve_provider_arguments
from tools.review_company_matches import public_employers


def save(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".partial")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Total employers (1-10000)")
    parser.add_argument("--batch-size", type=int, default=5, help="Employers per checkpoint and AI call (1-25)")
    parser.add_argument("--employers", type=Path, help="Public JSON cohort; otherwise select catalog employers")
    parser.add_argument("--root", type=Path, default=REPO_ROOT / ".backups/company-index")
    parser.add_argument("--refresh-index", action="store_true", help="Download and import CRO/Overture snapshots")
    parser.add_argument("--release", default="2026-09-23.1", help="Explicit Overture release for refresh")
    add_provider_arguments(parser)
    parser.add_argument("--timeout", type=int, default=120, help="Each AI request deadline (1-300 seconds)")
    parser.add_argument("--no-ai", action="store_true", help="Only exact local snapshot lookup")
    parser.add_argument("--no-fetch", action="store_true", help="Skip identity-review first-party HTTP evidence")
    parser.add_argument("--aliases", type=Path, help="Reviewed first-party alias witness inputs")
    args = parser.parse_args()
    try:
        resolve_provider_arguments(args)
    except ValueError as exc:
        parser.error(str(exc))
    if not 1 <= args.limit <= 10000 or not 1 <= args.batch_size <= 25 or not 1 <= args.timeout <= 300:
        parser.error("limit must be 1-10000, batch-size 1-25 and timeout 1-300")
    if not args.refresh_index and not (args.root / "companies.sqlite3").is_file():
        parser.error("Local company index missing; use --refresh-index to download it")
    args.root = args.root.resolve()
    if args.aliases:
        args.aliases = args.aliases.resolve()
    campaign = args.root / "campaigns" / (datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
    campaign.mkdir(parents=True, mode=0o700)
    report_path = campaign / "report.json"
    started = time.monotonic()
    provider_options = ["--provider", args.provider, "--model", args.model]
    if args.fallback_model:
        provider_options.extend(["--fallback-model", args.fallback_model])
    if args.allow_paid:
        provider_options.append("--allow-paid")
    report: dict = {
        "provider": args.provider,
        "model": args.model,
        "fallback_model": args.fallback_model,
        "allow_paid": args.allow_paid,
        "completed": False,
        "automatic_writes": 0,
        "checked": 0,
        "failed_stages": 0,
        "staff_size_scope": "AI global employee bracket; Irish headcount remains unknown",
        "address_policy": "CRO registered address, Overture place and AI office proposals require separate verification",
        "batches": [],
    }
    save(report_path, report)
    event("campaign_started", report=str(report_path), limit=args.limit, batch_size=args.batch_size)

    def stage(script: str, arguments: list[str], name: str, deadline: int) -> bool:
        return run_stage(
            [sys.executable, str(SERVICE_ROOT / "tools" / script), *arguments],
            stage=name,
            timeout=deadline,
            cwd=SERVICE_ROOT,
        )

    try:
        if args.refresh_index:
            if not stage(
                "company_index.py",
                ["refresh", "--root", str(args.root), "--release", args.release],
                "snapshot_refresh",
                3600,
            ):
                report["failed_stages"] += 1
                report["stop_reason"] = "snapshot_refresh_failed"
                raise SystemExit(1)
        else:
            event("snapshot_reused", root=str(args.root))
        with progress("select_public_employers"):
            employers = public_employers(args.employers, args.limit)
        report["total"] = len(employers)
        for offset in range(0, len(employers), args.batch_size):
            cohort = employers[offset : offset + args.batch_size]
            batch_dir = campaign / f"batch-{offset // args.batch_size + 1:04d}"
            batch_dir.mkdir()
            cohort_path = batch_dir / "employers.json"
            cohort_path.write_text(json.dumps(cohort), encoding="utf-8")
            common = ["--root", str(args.root), "--employers", str(cohort_path), "--limit", str(len(cohort))]
            batch: dict = {"employer_ids": [e["id"] for e in cohort], "stages": {}}
            event("batch_started", batch=offset // args.batch_size + 1, employers=len(cohort), total=len(employers))
            snapshot_path = batch_dir / "snapshot.json"
            ok = stage(
                "company_index.py", ["pilot", *common, "--report", str(snapshot_path)], "exact_snapshot_lookup", 180
            )
            batch["stages"]["snapshot"] = "complete" if ok else "failed"
            if ok:
                batch["snapshot"] = json.loads(snapshot_path.read_text())
            if not args.no_ai:
                identity_path = batch_dir / "identity.json"
                review = [
                    *common,
                    *provider_options,
                    "--report",
                    str(identity_path),
                    "--model",
                    args.model,
                    "--timeout",
                    str(args.timeout),
                ]
                if args.no_fetch:
                    review.append("--no-fetch")
                if args.aliases:
                    review.extend(["--aliases", str(args.aliases)])
                ok = stage(
                    "review_company_matches.py",
                    review,
                    "identity_evidence_review",
                    len(cohort) * (args.timeout * (2 if args.fallback_model else 1) + 120) + 60,
                )
                batch["stages"]["identity"] = "complete" if ok else "failed"
                if ok:
                    batch["identity"] = json.loads(identity_path.read_text())
                proposal_path = batch_dir / "ai-proposals.json"
                ok = stage(
                    "enrich_companies_ai.py",
                    [
                        *provider_options,
                        "--employers",
                        str(cohort_path),
                        "--limit",
                        str(len(cohort)),
                        "--report",
                        str(proposal_path),
                        "--model",
                        args.model,
                        "--timeout",
                        str(args.timeout),
                    ],
                    "ai_metadata_proposals",
                    args.timeout * (2 if args.fallback_model else 1) + 30,
                )
                batch["stages"]["ai"] = "complete" if ok else "failed"
                if ok:
                    batch["ai"] = json.loads(proposal_path.read_text())
            failures = sum(status == "failed" for status in batch["stages"].values())
            report["failed_stages"] += failures
            report["checked"] += len(cohort)
            report["batches"].append(batch)
            report["elapsed_seconds"] = round(time.monotonic() - started, 1)
            save(report_path, report)
            event(
                "batch_complete",
                checked=report["checked"],
                total=len(employers),
                failed_stages=report["failed_stages"],
                report=str(report_path),
            )
            if failures:
                report["stop_reason"] = "failed_batch"
                event("campaign_stopped", reason="review_failed_batch_before_spending_on_more_employers")
                break
        report["completed"] = report["checked"] == len(employers) and report["failed_stages"] == 0
    except KeyboardInterrupt:
        report["stop_reason"] = "interrupted"
        raise
    except Exception as exc:
        report["stop_reason"] = "unexpected_failure"
        report["error_category"] = type(exc).__name__
        raise
    finally:
        report["elapsed_seconds"] = round(time.monotonic() - started, 1)
        save(report_path, report)
        event(
            "campaign_finished",
            completed=report["completed"],
            checked=report["checked"],
            failed_stages=report["failed_stages"],
            report=str(report_path),
        )
    if not report["completed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
