"""CLI for scraping Irish employer job boards and updating Supabase."""

from __future__ import annotations

import argparse
import os
import sys
import time

from config import load_websites_config, validate_websites_config
from database.repository import sync_watchlist_metadata
from pipeline import synchronize
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
    websites = load_websites_config()
    issues = validate_websites_config(websites)
    if not issues:
        enabled_count = sum(1 for w in websites if w.get("enabled", True))
        print(f"OK: config/websites.yaml is valid! ({len(websites)} websites loaded, {enabled_count} enabled)")
    else:
        print(f"WARNING: Found {len(issues)} issue(s) in config/websites.yaml:")
    try:
        from database.repository import get_all_user_profiles

        profiles = get_all_user_profiles()
        print(f"OK: Supabase user profiles loaded! ({len(profiles)} active profile(s)):")
        for p in profiles:
            print(f"  - {p.get('name', 'User')} ({p.get('user_id')}): {p.get('headline', 'No headline')}")
    except Exception as exc:
        print(f"NOTICE: Could not query Supabase user profiles: {exc}")
    print("=" * 80)


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
        "--prune-only",
        action="store_true",
        help="Run only the 3-day stale job retention cleanup without scraping",
    )
    parser.add_argument(
        "--no-rescore",
        action="store_true",
        help="Skip the default automatic multi-user rescoring step",
    )
    parser.add_argument(
        "--rescore-only",
        "--rescore",
        dest="rescore_only",
        action="store_true",
        help="Run only the multi-user rescoring step without scraping",
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="Target a specific user UUID for profile rescoring (defaults to all users)",
    )
    args = parser.parse_args()

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

    if args.prune_only:
        from database.repository import prune_stale_jobs

        prune_stale_jobs(retention_days=3)
        return

    if args.rescore_only:
        from database.repository import rescore_all_jobs

        rescore_all_jobs(user_id=args.user_id)
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
    print(f"Scrape Summary ({duration:.1f}s):")
    print(f"  - Employers processed:       {result.get('scraped_employers', 'N/A')}")
    print(f"  - New opportunities added:   {result.get('added', 0)}")

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

    print("\nAll opportunities and tracking statuses saved directly to Supabase cloud database.")

    if not args.no_rescore:
        print("\n" + "=" * 72)
        print("Automatic Multi-User Rescoring: Calculating fit % for all profiles in Supabase...")
        print("=" * 72)
        from database.repository import rescore_all_jobs

        rescore_all_jobs(user_id=args.user_id)

    print("\nScraper completed. Exiting.")
    sys.exit(0)


if __name__ == "__main__":
    main()
