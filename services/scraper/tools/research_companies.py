"""Research a shared public employer cohort; archive proposals without catalog writes."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.database.client import get_supabase
from jobpulse_scraper.paths import REPO_ROOT, SERVICE_ROOT
from jobpulse_scraper.pipeline.ai_enrichment import enrich_companies_with_ai
from jobpulse_scraper.pipeline.company_campaign import run_stage
from jobpulse_scraper.pipeline.company_proposals import (
    CACHE_ROOT,
    ProposalStore,
    active_employers,
    research_batch,
    select_pending,
)
from jobpulse_scraper.pipeline.research_progress import event, progress
from jobpulse_scraper.pipeline.research_provider import add_provider_arguments, resolve_provider_arguments
from tools.review_company_matches import public_employers


def save(path: Path, data: dict) -> None:
    temporary = path.with_name(path.name + "." + uuid4().hex + ".partial")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def run_metadata(args: argparse.Namespace) -> None:
    provider_runs: list[dict] = []
    selection = {}
    outcome: dict = {}
    try:
        store = ProposalStore(args.proposal_cache)
        try:
            if args.show_cache:
                outcome = {"results": store.export(), "requested": 0, "cache_hits": 0}
                employers = []
            elif args.employers:
                employers = public_employers(args.employers, args.limit)
            else:
                with progress("select_active_employers"):
                    employers, selection = select_pending(
                        active_employers(get_supabase()), store, args.limit, refresh=args.refresh_proposals
                    )
                event("research_selection", **selection)
        finally:
            store.close()

        def produce(names: list[str]) -> list[dict]:
            with progress("ai_metadata", employers=len(names), model=args.model):
                return [
                    dict(proposal)
                    for proposal in enrich_companies_with_ai(
                        names,
                        model=args.model,
                        timeout_seconds=args.timeout,
                        provider=args.provider,
                        fallback_model=args.fallback_model,
                        allow_paid=args.allow_paid,
                        provider_runs=provider_runs,
                    )
                ]

        if not args.show_cache:
            outcome = research_batch(
                employers,
                args.proposal_cache,
                produce,
                provider=args.provider,
                model=args.model,
                provider_runs=provider_runs,
                refresh=args.refresh_proposals,
            )
        results = outcome["results"]
    except Exception as exc:
        cause = exc.__cause__
        if isinstance(cause, subprocess.CalledProcessError):
            event("provider_failed", provider=args.provider, exit_code=cause.returncode)
        elif isinstance(cause, subprocess.TimeoutExpired):
            event("provider_failed", provider=args.provider, reason="deadline")
        print(f"Company research failed: {type(exc).__name__}; no catalog writes performed", file=sys.stderr)
        raise SystemExit(1) from exc

    args.report.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.report.with_name(args.report.name + "." + uuid4().hex + ".partial")
    temporary.write_text(
        json.dumps(
            {
                "status": "unverified_proposals",
                "provider": args.provider,
                "model": args.model,
                "provider_runs": provider_runs,
                "review_required": "Review field evidence before using enrich_employers.py --registry",
                **outcome,
                "selection": selection,
                "cache": str(args.proposal_cache / "proposals.sqlite3"),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    temporary.replace(args.report)
    print(f"Saved {len(results)} unverified proposals to {args.report}; no catalog writes performed.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Total employers (1-10000)")
    parser.add_argument("--batch-size", type=int, default=5, help="Employers per checkpoint and AI call (1-25)")
    parser.add_argument("--employers", type=Path, help="Public JSON cohort; otherwise select catalog employers")
    parser.add_argument("--root", type=Path, default=REPO_ROOT / ".backups/company-index")
    parser.add_argument("--refresh-index", action="store_true", help="Download and import CRO/Overture snapshots")
    parser.add_argument("--release", default="2026-09-23.1", help="Explicit Overture release for refresh")
    parser.add_argument("--proposal-cache", "--cache", dest="proposal_cache", type=Path, default=CACHE_ROOT)
    parser.add_argument("--refresh-proposals", "--refresh", dest="refresh_proposals", action="store_true")
    parser.add_argument("--ai-only", action="store_true", help="Only AI metadata, with the same batches and cache")
    parser.add_argument("--show-cache", action="store_true", help="Export proposals without database or API calls")
    parser.add_argument("--report", type=Path, help="Campaign report destination, or proposal export destination")
    parser.add_argument("--metadata-batch", action="store_true", help=argparse.SUPPRESS)
    add_provider_arguments(parser)
    parser.add_argument("--timeout", type=int, default=120, help="Each AI request deadline (1-300 seconds)")
    parser.add_argument("--no-ai", action="store_true", help="Only exact local snapshot lookup")
    parser.add_argument("--no-fetch", action="store_true", help="Skip identity-review first-party HTTP evidence")
    parser.add_argument("--aliases", type=Path, help="Reviewed first-party alias witness inputs")
    args = parser.parse_args(argv)
    try:
        resolve_provider_arguments(args)
    except ValueError as exc:
        parser.error(str(exc))
    if not 1 <= args.limit <= 10000 or not 1 <= args.batch_size <= 25 or not 1 <= args.timeout <= 300:
        parser.error("limit must be 1-10000, batch-size 1-25 and timeout 1-300")
    if args.no_ai and (args.ai_only or args.show_cache or args.metadata_batch):
        parser.error("--no-ai cannot be combined with AI-only/cache modes")
    if args.metadata_batch or args.show_cache:
        if args.metadata_batch and args.limit > 25:
            parser.error("Metadata batches must contain at most 25 employers")
        args.report = args.report or REPO_ROOT / ".backups/company-proposals.json"
        run_metadata(args)
        return
    if args.ai_only and args.refresh_index:
        parser.error("--ai-only cannot refresh the snapshot index")
    if not args.ai_only and not args.refresh_index and not (args.root / "companies.sqlite3").is_file():
        parser.error("Local company index missing; use --refresh-index to download it")
    args.root = args.root.resolve()
    if args.aliases:
        args.aliases = args.aliases.resolve()
    campaign = args.root / "campaigns" / (datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
    campaign.mkdir(parents=True, mode=0o700)
    report_path = args.report or campaign / "report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
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
        if args.ai_only:
            event("snapshot_skipped", reason="ai_only")
        elif args.refresh_index:
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
            employers = (
                public_employers(args.employers, args.limit) if args.employers else active_employers(get_supabase())
            )
            if not args.no_ai:
                store = ProposalStore(args.proposal_cache)
                try:
                    employers, selection = select_pending(employers, store, args.limit, refresh=args.refresh_proposals)
                    report["selection"] = selection
                    event("research_selection", **selection)
                finally:
                    store.close()
            else:
                employers = employers[: args.limit]
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
            if not args.ai_only:
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
            if not args.no_ai:
                proposal_path = batch_dir / "ai-proposals.json"
                ok = stage(
                    "research_companies.py",
                    [
                        "--metadata-batch",
                        *provider_options,
                        "--cache",
                        str(args.proposal_cache.resolve()),
                        *(["--refresh"] if args.refresh_proposals else []),
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
