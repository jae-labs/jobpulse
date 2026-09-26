"""ATS Board Harvester CLI.

Discovers and tests direct ATS boards (Greenhouse, Ashby, Lever, Workable,
SmartRecruiters, Personio, Teamtailor) for active open positions in Ireland,
and can automatically promote verified boards into config/websites.yaml.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import sys
from pathlib import Path
from typing import Any

import yaml

SCRAPER_ROOT = Path(__file__).resolve().parent.parent
if str(SCRAPER_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRAPER_ROOT))

from config import load_websites_config, validate_websites_config  # noqa: E402
from scrapers.generic.listing import extract_jobs_from_listing  # noqa: E402


def test_single_board(employer: str, careers_url: str) -> list[dict[str, Any]]:
    """Test a single board URL directly using JobPulse provider adapters."""
    return extract_jobs_from_listing(employer, careers_url, "")


def load_candidate_seeds(seed_path: Path) -> list[dict[str, Any]]:
    """Load candidates from a seed YAML file."""
    if not seed_path.exists():
        return []
    with seed_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("seeds", [])


def harvest_boards(
    seeds: list[dict[str, Any]],
    max_workers: int = 10,
    timeout: int = 15,
) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    """Test candidate boards concurrently for active Irish opportunities."""
    active_results: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []

    print(f"Scanning {len(seeds)} candidate ATS boards for Ireland vacancies (workers={max_workers})...")
    print("-" * 78)

    def _check(seed: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        name = seed.get("name", "Unknown")
        url = seed.get("careers_url", "")
        if not url:
            return seed, []
        try:
            opps = extract_jobs_from_listing(name, url, "")
            return seed, opps
        except Exception:
            return seed, []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_check, s): s for s in seeds}
        for future in concurrent.futures.as_completed(futures):
            seed, opps = future.result()
            name = seed.get("name", "Unknown")
            url = seed.get("careers_url", "")
            if opps:
                print(f"  [FOUND] {name:<28} -> {len(opps)} Irish role(s) found at {url}")
                active_results.append((seed, opps))
            else:
                print(f"  [EMPTY] {name:<28} -> 0 Irish roles found")

    print("-" * 78)
    print(f"Harvest complete: {len(active_results)} / {len(seeds)} boards have active Ireland vacancies.")
    return active_results


def append_to_websites_yaml(active_seeds: list[dict[str, Any]], websites_path: Path) -> int:
    """Safely append newly verified Irish employers to config/websites.yaml."""
    existing_websites = load_websites_config()
    existing_names = {w["name"].strip().lower() for w in existing_websites}
    existing_urls = {w.get("careers_url", "").strip().lower() for w in existing_websites}

    new_entries: list[dict[str, Any]] = []
    for s in active_seeds:
        name = s.get("name", "").strip()
        url = s.get("careers_url", "").strip()
        if not name or not url:
            continue
        if name.lower() in existing_names or url.lower() in existing_urls:
            print(f"Skipping already configured: {name}")
            continue

        entry = {
            "name": name,
            "sector": s.get("sector", "Technology"),
            "priority": s.get("priority", 85),
            "careers_url": url,
            "enabled": True,
            "scraper": "generic_crawler",
            "scraper_type": "watchlist",
        }
        new_entries.append(entry)

    if not new_entries:
        print("No new unique employers to add.")
        return 0

    print(f"Appending {len(new_entries)} new verified Irish employer(s) to {websites_path.name}...")

    # Load raw yaml document to preserve structure
    with websites_path.open("r", encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}

    site_list = doc.get("websites", [])
    site_list.extend(new_entries)
    doc["websites"] = site_list

    with websites_path.open("w", encoding="utf-8") as f:
        yaml.dump(doc, f, sort_keys=False, allow_unicode=True)

    # Validate resulting config
    issues = validate_websites_config(load_websites_config())
    if issues:
        print(f"ERROR: config validation found issues after appending: {issues}")
    else:
        print(f"SUCCESS: config/websites.yaml updated and validated ({len(site_list)} total websites).")

    return len(new_entries)


def main() -> None:
    parser = argparse.ArgumentParser(description="JobPulse ATS Board Harvester")
    parser.add_argument(
        "--test-url",
        type=str,
        default=None,
        help="Quickly test a single ATS URL to see if it yields Irish roles",
    )
    parser.add_argument(
        "--employer",
        type=str,
        default="Test Employer",
        help="Employer name for single URL test",
    )
    parser.add_argument(
        "--seeds",
        type=str,
        default="config/board_seeds.yaml",
        help="Path to YAML file with candidate seeds",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Automatically append verified boards with active Irish jobs to config/websites.yaml",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Concurrent worker threads",
    )
    args = parser.parse_args()

    if args.test_url:
        print(f"Testing URL for {args.employer}: {args.test_url}")
        opps = test_single_board(args.employer, args.test_url)
        print(f"\nResults: {len(opps)} Irish role(s) found:")
        for o in opps:
            print(f"  - {o['title']} ({o['location']})")
            print(f"    URL:    {o['url']}")
            if o.get("salary_text"):
                print(f"    Salary: {o['salary_text']}")
        return

    seed_file = SCRAPER_ROOT / args.seeds
    if not seed_file.exists():
        print(f"Seed file not found: {seed_file}")
        sys.exit(1)

    seeds = load_candidate_seeds(seed_file)
    if not seeds:
        print(f"No seeds found in {seed_file}")
        sys.exit(0)

    active = harvest_boards(seeds, max_workers=args.workers)

    if args.apply and active:
        websites_file = SCRAPER_ROOT / "config" / "websites.yaml"
        active_seeds = [s for s, _ in active]
        append_to_websites_yaml(active_seeds, websites_file)


if __name__ == "__main__":
    main()
