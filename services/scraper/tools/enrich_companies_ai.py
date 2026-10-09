"""Generate unverified company research proposals via agy; never write catalog data.

Review first-party field evidence and apply it through tools/enrich_employers.py --registry.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.database.client import get_supabase
from jobpulse_scraper.pipeline.ai_enrichment import enrich_companies_with_ai
from jobpulse_scraper.pipeline.company_proposals import (
    CACHE_ROOT,
    ProposalStore,
    active_employers,
    research_batch,
    select_pending,
)
from jobpulse_scraper.pipeline.research_progress import event, progress
from jobpulse_scraper.pipeline.research_provider import add_provider_arguments, resolve_provider_arguments
from tools.review_company_matches import public_employers


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Employers to propose (1-25)")
    parser.add_argument("--report", type=Path, required=True, help="Unverified JSON proposal destination")
    parser.add_argument("--cache", type=Path, default=CACHE_ROOT)
    parser.add_argument("--refresh", action="store_true", help="Research again, including cached unknown fields")
    parser.add_argument("--show-cache", action="store_true", help="Export stored proposals without API calls")
    add_provider_arguments(parser)
    parser.add_argument("--employers", type=Path, help="Public employer JSON cohort instead of catalog selection")
    parser.add_argument("--timeout", type=int, default=120, help="Provider deadline in seconds (1-300)")
    args = parser.parse_args()
    try:
        resolve_provider_arguments(args)
    except ValueError as exc:
        parser.error(str(exc))
    if not 1 <= args.timeout <= 300:
        parser.error("--timeout must be between 1 and 300")
    if not 1 <= args.limit <= 25:
        parser.error("--limit must be between 1 and 25")

    provider_runs: list[dict] = []
    selection = {}
    outcome: dict = {}
    try:
        store = ProposalStore(args.cache)
        try:
            if args.show_cache:
                outcome = {"results": store.export(), "requested": 0, "cache_hits": 0}
                employers = []
            elif args.employers:
                employers = public_employers(args.employers, args.limit)
            else:
                with progress("select_active_employers"):
                    employers, selection = select_pending(
                        active_employers(get_supabase()), store, args.limit, refresh=args.refresh
                    )
                event("research_selection", **selection)
        finally:
            store.close()

        def produce(names: list[str]) -> list[dict]:
            with progress("ai_metadata", employers=len(names), model=args.model):
                return [
                    dict(proposal)
                    for proposal in enrich_companies_with_ai(
                        names,
                        model=args.model,
                        timeout_seconds=args.timeout,
                        provider=args.provider,
                        fallback_model=args.fallback_model,
                        allow_paid=args.allow_paid,
                        provider_runs=provider_runs,
                    )
                ]

        if not args.show_cache:
            outcome = research_batch(
                employers,
                args.cache,
                produce,
                provider=args.provider,
                model=args.model,
                provider_runs=provider_runs,
                refresh=args.refresh,
            )
        results = outcome["results"]
    except Exception as exc:
        cause = exc.__cause__
        if isinstance(cause, subprocess.CalledProcessError):
            event("provider_failed", provider=args.provider, exit_code=cause.returncode)
        elif isinstance(cause, subprocess.TimeoutExpired):
            event("provider_failed", provider=args.provider, reason="deadline")
        print(f"Company research failed: {type(exc).__name__}; no catalog writes performed", file=sys.stderr)
        raise SystemExit(1) from exc

    args.report.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.report.with_name(args.report.name + "." + uuid4().hex + ".partial")
    temporary.write_text(
        json.dumps(
            {
                "status": "unverified_proposals",
                "provider": args.provider,
                "model": args.model,
                "provider_runs": provider_runs,
                "review_required": "Review field evidence before using enrich_employers.py --registry",
                **outcome,
                "selection": selection,
                "cache": str(args.cache / "proposals.sqlite3"),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    temporary.replace(args.report)
    print(f"Saved {len(results)} unverified proposals to {args.report}; no catalog writes performed.")


if __name__ == "__main__":
    main()
