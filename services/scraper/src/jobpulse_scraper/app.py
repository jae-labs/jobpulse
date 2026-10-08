"""CLI for scraping Irish employer job boards and updating Supabase."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

from jobpulse_scraper.config import load_board_config, load_websites_config, validate_websites_config
from jobpulse_scraper.contracts import MAX_WORKER_TASKS
from jobpulse_scraper.database.repository import sync_watchlist_metadata
from jobpulse_scraper.pipeline.runner import synchronize
from jobpulse_scraper.server import run_server


def list_configured_websites() -> None:
    """Print an easy-to-read list of all websites configured in config/websites.yaml."""
    websites = load_websites_config()
    print("=" * 80)
    print(f"Configured Websites & Employers ({len(websites)} total):")
    print("=" * 80)
    print(f"{'#':<4} {'Status':<9} {'Pri':<5} {'Name':<32} {'Sector':<22}")
    print("-" * 80)
    for idx, w in enumerate(websites, 1):
        status = "[ON] " if w.get("enabled", True) else "[OFF]"
        pri = w.get("priority", 50)
        name = w["name"][:30]
        sector = w.get("sector", "General")[:20]
        print(f"{idx:<4} {status:<9} {pri:<5} {name:<32} {sector:<22}")
    print("-" * 80)
    print("To add, remove, or toggle websites: edit config/websites.yaml")


def validate_config_cli() -> None:
    """Validate YAML configuration files and report any issues."""
    print("=" * 80)
    print("Validating JobPulse Configuration...")
    print("=" * 80)
    try:
        websites = load_websites_config()
        issues = validate_websites_config(websites)
    except ValueError as exc:
        print(str(exc))
        raise SystemExit(1) from exc
    if not issues:
        enabled_count = sum(1 for w in websites if w.get("enabled", True))
        print(f"OK: config/websites.yaml is valid! ({len(websites)} websites loaded, {enabled_count} enabled)")
    else:
        print(f"ERROR: Found {len(issues)} issue(s) in config/websites.yaml:")
        for issue in issues:
            print(f"- {issue}")
    print("=" * 80)
    if issues:
        raise SystemExit(1)


def list_boards_cli() -> None:
    targets = load_board_config()
    print(f"Crawl targets ({len(targets)}): database catalog, or YAML if unavailable")
    print(f"{'ID':<8} {'Enabled':<8} {'Priority':<9} {'Provider':<16} {'Company':<32} Careers URL")
    for target in targets:
        print(
            f"{str(target.get('board_id') or '-'):<8} {str(target.get('enabled', True)):<8} "
            f"{target.get('priority', 50):<9} {target.get('provider', 'generic'):<16} "
            f"{target['name']:<32} {target['careers_url']}"
        )


def main() -> None:
    """Command-line interface for JobPulse scraper."""
    parser = argparse.ArgumentParser(
        description="JobPulse Scraper - Scrapes Irish employer job boards and syncs opportunities to Supabase."
    )
    parser.add_argument(
        "--employer",
        type=str,
        default=None,
        help="Scrape only a specific employer by name (e.g. 'Maynooth University')",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit source targets in enqueue/sync mode or task count in worker/auto mode",
    )
    parser.add_argument(
        "--no-core",
        action="store_true",
        help="Skip core specialized scrapers and run only watchlist employers",
    )
    parser.add_argument(
        "--core-only",
        action="store_true",
        help="Run only core specialized scrapers and skip watchlist employers",
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="Run local HTTP REST API server instead of running scraper and exiting",
    )
    parser.add_argument(
        "--list-boards",
        action="store_true",
        help="List live database crawl targets, including disabled boards; YAML fallback only if unavailable",
    )
    parser.add_argument(
        "--list-websites",
        action="store_true",
        help="List all websites configured in config/websites.yaml and exit",
    )
    parser.add_argument(
        "--validate-config",
        action="store_true",
        help="Check config/websites.yaml for syntax or formatting errors",
    )
    parser.add_argument(
        "--dedupe-only",
        "--dedupe-db-only",
        dest="dedupe_only",
        action="store_true",
        help="Run only the database deduplication sweep without scraping",
    )
    parser.add_argument(
        "--backfill-embeddings",
        action="store_true",
        help="Generate missing job vectors for an existing catalog without crawling",
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Queue eligible enabled sources without resetting unfinished tasks, then process due work",
    )
    parser.add_argument("--sync", action="store_true", help="Run the synchronous pipeline explicitly")
    parser.add_argument("--enqueue", action="store_true", help="Queue enabled sources durably without crawling")
    parser.add_argument("--worker", action="store_true", help="Process bounded durable crawl tasks")
    parser.add_argument("--replay", help="Replay a snapshot metadata key offline without database writes")
    parser.add_argument(
        "--request-history", action="store_true", help="Show bounded public-source transport observations"
    )
    args = parser.parse_args()

    if args.limit is not None and args.limit <= 0:
        parser.error("--limit must be positive")

    if args.request_history:
        from jobpulse_scraper.network.ledger import RequestLedger
        from jobpulse_scraper.network.request_policy import STATE_PATH

        print(json.dumps(RequestLedger(STATE_PATH.with_suffix(".sqlite3")).summary(), indent=2))
        return

    if args.replay:
        from jobpulse_scraper.paths import STATE_ROOT
        from jobpulse_scraper.snapshots import SnapshotStore

        print(json.dumps([job.as_record() for job in SnapshotStore(STATE_ROOT / "snapshots").replay(args.replay)]))
        return

    auto = args.auto and not any(
        (
            args.enqueue,
            args.worker,
            args.sync,
            args.employer,
            args.no_core,
            args.core_only,
            args.server,
            args.list_boards,
            args.list_websites,
            args.validate_config,
            args.dedupe_only,
            args.backfill_embeddings,
        )
    )
    if (args.worker or auto) and args.limit is not None and args.limit > MAX_WORKER_TASKS:
        parser.error(f"Worker limit must be between 1 and {MAX_WORKER_TASKS}")
    if args.enqueue or args.worker or auto:
        from jobpulse_scraper.runtime.queue import CrawlQueue, enqueue_configured, run_worker

        queue = CrawlQueue()
        if auto:
            print(json.dumps({"queued": enqueue_configured(queue, only_if_idle=True)}))
        if args.enqueue:
            print(json.dumps({"queued": enqueue_configured(queue, args.employer, args.limit)}))
        if args.worker or auto:
            result = run_worker(queue, max_tasks=args.limit or (MAX_WORKER_TASKS if auto else 20))
            print(json.dumps(result))
            if result["incomplete"] or result["lease_lost"]:
                raise SystemExit(1)
        return

    if args.list_boards:
        list_boards_cli()
        return

    if args.list_websites:
        list_configured_websites()
        return

    if args.validate_config:
        validate_config_cli()
        return

    if args.dedupe_only:
        from jobpulse_scraper.database.repository import deduplicate_database_jobs

        deduplicate_database_jobs()
        return

    if args.backfill_embeddings:
        from jobpulse_scraper.database.repository import backfill_job_embeddings

        print(f"Checked embeddings for {backfill_job_embeddings()} existing jobs.")
        return

    sync_watchlist_metadata()

    if args.server:
        host = os.environ.get("HOST", "127.0.0.1")
        port = int(os.environ.get("PORT", "8000"))
        run_server(host=host, port=port)
        return

    print("=" * 72)
    print("JobPulse Scraper Starting")
    if args.employer:
        print(f"Target Employer: {args.employer}")
    elif args.limit:
        print(f"Target: Watchlist limited to {args.limit} employers")
    elif args.core_only:
        print("Target: Core specialized scrapers only")
    else:
        print("Target: All configured employers")
    print("=" * 72)

    start_time = time.time()
    result = synchronize(
        employer=args.employer,
        limit=args.limit,
        full=True,
        skip_core=args.no_core,
        core_only=args.core_only,
    )

    duration = time.time() - start_time

    print("\n" + "=" * 72)
    print(f"Pipeline Summary ({duration:.1f}s):")
    print(f"  - Employers processed:       {result.get('scraped_employers', 'N/A')}")
    print(f"  - Vacancies saved/updated:   {result.get('added', 0)}")

    outcomes = result.get("outcomes") or []
    if outcomes:
        # Count structured terminal outcomes, not English substrings: an
        # ``unsupported`` board must never be reported as having opportunities,
        # and cooldown-skipped boards are not scrapes at all.
        groups: dict[str, list[dict]] = {}
        for row in outcomes:
            groups.setdefault(str(row.get("outcome", "")), []).append(row)

        synced = groups.get("synced", [])
        empty = groups.get("empty", [])
        unsupported = groups.get("unsupported", [])
        blocked = groups.get("blocked", []) + groups.get("auth_wall", [])
        failed = groups.get("failed", [])
        processed = result.get("scraped_employers")
        skipped = max(0, processed - len(outcomes)) if isinstance(processed, int) else 0

        print(f"  - Employers with opportunities: {len(synced)}")
        print(f"  - Employers with 0 found:    {len(empty)}")
        print(f"  - Employers unsupported:     {len(unsupported)}")
        print(f"  - Employers blocked / auth:  {len(blocked)}")
        print(f"  - Employers with errors:     {len(failed)}")
        print(f"  - Employers skipped (cooldown): {skipped}")

        actionable = failed + blocked
        if actionable:
            print("\nFailed / Unavailable Employers:")
            for row in actionable[:10]:
                detail = row.get("detail") or row.get("message") or row.get("url") or "no detail"
                print(f"    - {row.get('employer', '?')}: {detail}")
            if len(actionable) > 10:
                print(f"    - ... and {len(actionable) - 10} more.")

    incomplete = result.get("status") == "incomplete"
    if incomplete:
        print("\nScraper incomplete: persisted vacancies retained; failed sources require retry.")
    else:
        print("\nVacancy facts and job embeddings saved to Supabase.")
    print("\nScraper completed. Exiting.")
    sys.exit(1 if incomplete else 0)


if __name__ == "__main__":
    main()
