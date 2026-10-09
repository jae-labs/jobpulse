"""Verify a bounded batch of public posting availability; preview by default."""

from __future__ import annotations

import argparse
import json

from jobpulse_scraper.pipeline.job_availability import verify_availability


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=2)
    args = parser.parse_args()
    result = verify_availability(apply=args.apply, limit=args.limit, concurrency=args.concurrency)
    print(json.dumps(result, sort_keys=True))
    if result["conflicts"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
