"""Configuration loader for JobPulse websites and runtime settings."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path(__file__).resolve().parent

# Core URLs
KILDARE_CAREERS_URL = "https://kildarecoco.ie/AllServices/CareerOpportunities/"
PUBLICJOBS_URL = "https://publicjobs.tal.net/vx/lang-en-GB/mobile-0/appcentre-ext/brand-4/xf-c0d4bb6feea9/candidate/jobboard/vacancy/3/adv/"
MAYNOOTH_SEARCH_URL = "https://my.corehr.com/pls/nuimrecruit/erq_search_version_4.start_search_with_params"
INTEL_JOBS_URL = "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs"
INTEL_CAREERS_URL = "https://intel.wd1.myworkdayjobs.com/External"
JOBSIRELAND_URL = "https://jobsireland.ie/en-US/browse-jobs"
JOBSIRELAND_API_URL = "https://jobsireland.ie/Jobsireland.API/JobsIreland/BrowseJobs/43"


def load_websites_config(path: Path | str | None = None) -> list[dict[str, Any]]:
    """Load explicit YAML/JSON configuration; never hide malformed or missing sources."""
    target_path = Path(path) if path else (CONFIG_DIR / "websites.yaml")
    try:
        content = target_path.read_text(encoding="utf-8")
        parsed = yaml.safe_load(content) if target_path.suffix in (".yaml", ".yml") else json.loads(content)
        items = parsed.get("websites") if isinstance(parsed, dict) else parsed
        if not isinstance(items, list) or not items:
            raise ValueError("Expected a non-empty websites list")
        cleaned_items = []
        for position, entry in enumerate(items, start=1):
            if not isinstance(entry, dict) or not entry.get("name") or not entry.get("careers_url"):
                raise ValueError(f"Entry #{position}: name and careers_url are required")
            if not isinstance(entry.get("enabled", True), bool):
                raise ValueError(f"Entry #{position}: enabled must be a boolean")
            cleaned_items.append(
                {
                    "name": str(entry["name"]).strip(),
                    "sector": str(entry.get("sector", "General")).strip(),
                    "priority": entry.get("priority", 50),
                    "careers_url": str(entry["careers_url"]).strip(),
                    "enabled": entry.get("enabled", True),
                    "scraper": str(entry.get("scraper", "generic_crawler")).strip(),
                    "scraper_type": str(entry.get("scraper_type", "watchlist")).strip(),
                    "notes": str(entry.get("notes", "")).strip(),
                }
            )
        issues = validate_websites_config(cleaned_items)
        if issues:
            raise ValueError("; ".join(issues))
        return cleaned_items
    except (OSError, ValueError, yaml.YAMLError) as exc:
        raise ValueError(f"Invalid source configuration {target_path}: {exc}") from exc


def get_employers_tuples(
    websites_data: list[dict[str, Any]] | None = None,
    enabled_only: bool = False,
) -> list[tuple[str, str, int, str]]:
    """
    Return employers as a list of (name, sector, priority, careers_url) tuples
    for full compatibility with existing database seeding and scrapers.

    When no explicit data is supplied the database-backed board catalog is the
    source of truth; ``config/websites.yaml`` is only the import/offline seed.
    """
    if websites_data is None:
        from config.boards import get_board_employer_tuples

        return get_board_employer_tuples(enabled_only=enabled_only)
    data = websites_data if websites_data is not None else load_websites_config()
    res: list[tuple[str, str, int, str]] = []
    for w in data:
        if enabled_only and not w.get("enabled", True):
            continue
        res.append((w["name"], w["sector"], w["priority"], w["careers_url"]))
    return res


def validate_websites_config(websites: list[dict[str, Any]] | None = None) -> list[str]:
    """Validate websites list for format errors, missing fields, or duplicate names."""
    data = websites if websites is not None else load_websites_config()
    issues: list[str] = []
    if not data:
        issues.append("No websites loaded. Check config/websites.yaml.")
        return issues

    seen_names = set()
    for idx, site in enumerate(data):
        pos = idx + 1
        name = site.get("name")
        if not name:
            issues.append(f"Entry #{pos}: Missing required field 'name'")
            continue

        if name.lower() in seen_names:
            issues.append(f"Entry #{pos} ('{name}'): Duplicate employer name")
        seen_names.add(name.lower())

        url = site.get("careers_url")
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            issues.append(f"Entry #{pos} ('{name}'): Invalid careers_url '{url}'")

        priority = site.get("priority")
        if isinstance(priority, bool) or not isinstance(priority, int) or not (1 <= priority <= 100):
            issues.append(f"Entry #{pos} ('{name}'): Priority must be an integer between 1 and 100 (got {priority})")

    return issues
