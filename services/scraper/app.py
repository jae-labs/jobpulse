"""CLI for scraping Irish employer job boards and updating Supabase."""

from __future__ import annotations

import argparse
import os
import sys
import time

from config import load_board_config, load_websites_config, validate_websites_config
from database.repository import sync_watchlist_metadata
from pipeline.runner import synchronize
from server import run_server


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
        help="Limit number of watchlist employers to scrape",
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
    args = parser.parse_args()

    if args.limit is not None and args.limit <= 0:
        parser.error("--limit must be positive")

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
        from database.repository import deduplicate_database_jobs

        deduplicate_database_jobs()
        return

    if args.backfill_embeddings:
        from database.repository import backfill_job_embeddings

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

    msgs = result.get("messages", [])
    if msgs:
        failures = [
            m
            for m in msgs
            if "error" in m.lower()
            or "exception" in m.lower()
            or "unavailable" in m.lower()
            or "not found" in m.lower()
        ]
        successes = [m for m in msgs if m not in failures]
        zero_roles = [m for m in successes if "0 opportunities" in m or "0 relevant" in m]
        with_roles = [m for m in successes if m not in zero_roles]

        print(f"  - Employers with opportunities: {len(with_roles)}")
        print(f"  - Employers with 0 found:    {len(zero_roles)}")
        print(f"  - Employers with errors:     {len(failures)}")

        if failures:
            print("\nFailed / Unavailable Employers:")
            for err in failures[:10]:
                print(f"    - {err}")
            if len(failures) > 10:
                print(f"    - ... and {len(failures) - 10} more.")

    incomplete = result.get("status") == "incomplete"
    if incomplete:
        print("\nScraper incomplete: persisted vacancies retained; failed sources require retry.")
    else:
        print("\nVacancy facts and job embeddings saved to Supabase.")
    print("\nScraper completed. Exiting.")
    sys.exit(1 if incomplete else 0)


if __name__ == "__main__":
    main()
