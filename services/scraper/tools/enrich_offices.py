"""Discover persistent company offices; preview by default, --apply to save."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.employer_offices import enrich_offices


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    counts = enrich_offices(apply=args.apply, limit=args.limit, report=args.report)
    print(json.dumps(counts, sort_keys=True))
    if counts["provider_failed"] or counts["conflicts"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
