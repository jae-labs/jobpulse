"""
Comprehensive verification gate for JobPulse backend:
- Module imports and dependencies
- Supabase connectivity and schema accessibility
- Websites configuration validation
- Job embedding input sanity check
- REST API handler smoke test
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def run_checks() -> bool:
    start_time = time.time()
    print("=" * 72)
    print("JobPulse Backend Verification Gate")
    print("=" * 72)

    errors = []

    # 1. Check Module Imports
    print("\n[1/5] Verifying module imports...")
    try:
        from database.client import get_supabase
        from engine.embeddings import build_job_document

        print("  -> All core modules imported successfully.")
    except Exception as exc:
        err = f"Module import failed: {exc}"
        print(f"  [FAIL] {err}")
        errors.append(err)

    # 2. Check Websites Configuration
    print("\n[2/5] Validating config/websites.yaml...")
    try:
        from config.loader import load_websites_config, validate_websites_config

        sites = load_websites_config()
        issues = validate_websites_config(sites)
        if issues:
            for issue in issues:
                print(f"  [WARN] {issue}")
            errors.append(f"Found {len(issues)} config issue(s).")
        else:
            enabled_count = sum(1 for s in sites if s.get("enabled", True))
            print(f"  -> Validated {len(sites)} websites ({enabled_count} active).")
    except Exception as exc:
        err = f"Config validation failed: {exc}"
        print(f"  [FAIL] {err}")
        errors.append(err)

    # 3. Check Supabase Connectivity
    print("\n[3/5] Testing Supabase database connection...")
    try:
        from database.client import get_supabase

        supabase = get_supabase()
        res = supabase.table("jobs").select("id", count="exact").limit(1).execute()
        total_jobs = res.count if res.count is not None else len(res.data)
        print(f"  -> Connected to Supabase: {total_jobs:,} jobs currently in database.")

    except Exception as exc:
        err = f"Supabase connection error: {exc}"
        print(f"  [FAIL] {err}")
        errors.append(err)

    # 4. Check job embedding document construction
    print("\n[4/5] Testing job embedding input...")
    try:
        from engine.embeddings import build_job_document

        assert build_job_document({"title": "Analyst", "description": "Build reports"}) == "Analyst\nBuild reports"
        print("  -> Job embedding input passed.")
    except Exception as exc:
        err = f"Job embedding input failed: {exc}"
        print(f"  [FAIL] {err}")
        errors.append(err)

    # 5. Check REST API Handler
    print("\n[5/5] Testing REST API route formatting...")
    try:
        from server.api import GLOBAL_DATA_VERSION

        assert GLOBAL_DATA_VERSION > 0
        print("  -> API server handler initialized and versioned.")
    except Exception as exc:
        err = f"API check failed: {exc}"
        print(f"  [FAIL] {err}")
        errors.append(err)

    # Summary
    duration = time.time() - start_time
    print("\n" + "=" * 72)
    if errors:
        print(f"FAILED: {len(errors)} error(s) detected ({duration:.2f}s):")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print(f"SUCCESS: All backend checks passed cleanly in {duration:.2f}s!")
        print("=" * 72)
        return True


if __name__ == "__main__":
    success = run_checks()
    sys.exit(0 if success else 1)
