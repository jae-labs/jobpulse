"""Verify each stored vacancy location externally; preview unless --apply is passed."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.job_locations import verify_catalog_locations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    counts = verify_catalog_locations(apply=args.apply, limit=args.limit, report=args.report)
    print(json.dumps(counts, sort_keys=True))
    if counts["failed"] or counts["conflicts"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
