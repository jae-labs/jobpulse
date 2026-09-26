"""Configuration loader for JobPulse websites, candidate profile, and runtime settings."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:
    import yaml

    HAS_YAML = True
except ImportError:
    HAS_YAML = False

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = Path(__file__).resolve().parent

# Core URLs
KILDARE_CAREERS_URL = "https://kildarecoco.ie/AllServices/CareerOpportunities/"
PUBLICJOBS_URL = "https://publicjobs.tal.net/vx/lang-en-GB/mobile-0/appcentre-ext/brand-4/xf-c0d4bb6feea9/candidate/jobboard/vacancy/3/adv/"
MAYNOOTH_SEARCH_URL = "https://my.corehr.com/pls/nuimrecruit/erq_search_version_4.start_search_with_params"
UCD_SEARCH_URL = "https://my.corehr.com/pls/ucdrecruit/erq_search_version_4.start_search_with_params"
INTEL_JOBS_URL = "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs"
INTEL_CAREERS_URL = "https://intel.wd1.myworkdayjobs.com/External"

DEFAULT_PROFILE: dict[str, Any] = {
    "name": "",
    "headline": "General Professional",
    "location": "Ireland",
    "minimum_salary": 50000,
    "employment": "Permanent only",
    "education": "",
    "current_role": "",
    "summary": "",
    "keywords": [],
}


_profile_cache: dict[str, Any] = {}


def load_profile(user_id: str | None = None, force_refresh: bool = False) -> dict[str, Any]:
    """
    Load candidate profile dynamically from Supabase `user_profiles`.
    If user_id is provided, fetches that specific user's profile.
    Cached in memory during scraping runs to eliminate redundant HTTP requests.
    Falls back to first active Supabase profile, or DEFAULT_PROFILE if offline.
    """
    cache_key = user_id or "__default__"
    if not force_refresh and cache_key in _profile_cache:
        return dict(_profile_cache[cache_key])

    try:
        from database.client import get_supabase

        supabase = get_supabase()
        if user_id:
            res = supabase.table("user_profiles").select("*").eq("user_id", user_id).limit(1).execute()
        else:
            res = supabase.table("user_profiles").select("*").limit(1).execute()

        if res.data:
            merged = dict(DEFAULT_PROFILE)
            merged.update(res.data[0])
            _profile_cache[cache_key] = merged
            return dict(merged)
    except Exception as exc:
        print(f"[CONFIG] Notice: Profile loading from Supabase ({exc}). Using defaults.")

    fallback = dict(DEFAULT_PROFILE)
    _profile_cache[cache_key] = fallback
    return fallback


def load_websites_config(path: Path | str | None = None) -> list[dict[str, Any]]:
    """Load websites and employer metadata from YAML or JSON."""
    target_path = Path(path) if path else (CONFIG_DIR / "websites.yaml")
    if not target_path.exists():
        json_alt = CONFIG_DIR / "websites.json"
        if json_alt.exists():
            target_path = json_alt

    if target_path.exists():
        try:
            with open(target_path, encoding="utf-8") as f:
                content = f.read()
                if HAS_YAML and (target_path.suffix in (".yaml", ".yml")):
                    parsed = yaml.safe_load(content)
                else:
                    parsed = json.loads(content)

                if isinstance(parsed, dict) and "websites" in parsed:
                    items = parsed["websites"]
                elif isinstance(parsed, list):
                    items = parsed
                else:
                    items = []

                cleaned_items: list[dict[str, Any]] = []
                for entry in items:
                    if isinstance(entry, dict) and entry.get("name") and entry.get("careers_url"):
                        cleaned_items.append(
                            {
                                "name": str(entry["name"]).strip(),
                                "sector": str(entry.get("sector", "General")).strip(),
                                "priority": int(entry.get("priority", 50)),
                                "careers_url": str(entry["careers_url"]).strip(),
                                "enabled": bool(entry.get("enabled", True)),
                                "scraper": str(entry.get("scraper", "generic_crawler")).strip(),
                                "scraper_type": str(entry.get("scraper_type", "watchlist")).strip(),
                                "notes": str(entry.get("notes", "")).strip(),
                            }
                        )
                if cleaned_items:
                    return cleaned_items
        except Exception as e:
            print(f"[CONFIG] Warning: Error reading {target_path} ({e}). Falling back to defaults.")

    return []


def get_employers_tuples(
    websites_data: list[dict[str, Any]] | None = None,
    enabled_only: bool = False,
) -> list[tuple[str, str, int, str]]:
    """
    Return employers as a list of (name, sector, priority, careers_url) tuples
    for full compatibility with existing database seeding and scrapers.
    """
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
        if priority is None or not isinstance(priority, int) or not (1 <= priority <= 100):
            issues.append(f"Entry #{pos} ('{name}'): Priority must be an integer between 1 and 100 (got {priority})")

    return issues
