"""Generate unverified company research proposals via agy; never write catalog data.

Review first-party field evidence and apply it through tools/enrich_employers.py --registry.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobpulse_scraper.database.client import get_supabase, retry_supabase
from jobpulse_scraper.database.records import response_records
from jobpulse_scraper.pipeline.ai_enrichment import enrich_companies_with_ai
from jobpulse_scraper.pipeline.research_progress import progress
from tools.review_company_matches import public_employers


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Employers to propose (1-25)")
    parser.add_argument("--report", type=Path, required=True, help="Unverified JSON proposal destination")
    parser.add_argument("--model", default="gemini-3.8-flash-low", help="agy model")
    parser.add_argument("--employers", type=Path, help="Public employer JSON cohort instead of catalog selection")
    parser.add_argument("--timeout", type=int, default=120, help="Provider deadline in seconds (1-300)")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 300:
        parser.error("--timeout must be between 1 and 300")
    if not 1 <= args.limit <= 25:
        parser.error("--limit must be between 1 and 25")

    if args.employers:
        employers = public_employers(args.employers, args.limit)
    else:
        client = get_supabase()
        employers = response_records(
            retry_supabase(
                lambda: (
                    client.table("employers")
                    .select("id,name")
                    .eq("metadata_source", "unverified")
                    .order("id")
                    .limit(args.limit)
                    .execute()
                )
            ).data
        )
    try:
        if len({e["name"].casefold() for e in employers}) != len(employers):
            raise ValueError("Employer names must be unique within an AI batch")
        with progress("ai_metadata", employers=len(employers), model=args.model):
            proposals = enrich_companies_with_ai(
                [employer["name"] for employer in employers], model=args.model, timeout_seconds=args.timeout
            )
        names = {employer["name"].casefold(): employer for employer in employers}
        results = []
        seen = set()
        for proposal in proposals:
            key = proposal["name"].casefold()
            if key not in names or key in seen:
                raise ValueError("Model returned an unknown or duplicate employer identity")
            seen.add(key)
            results.append({"employer_id": names[key]["id"], "proposal": proposal})
        if len(results) != len(employers):
            raise ValueError("Model omitted requested employer identities")
    except Exception as exc:
        print(f"Company research failed: {type(exc).__name__}; no catalog writes performed", file=sys.stderr)
        raise SystemExit(1) from exc

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(
            {
                "status": "unverified_proposals",
                "review_required": "Review field evidence before using enrich_employers.py --registry",
                "results": results,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(f"Saved {len(results)} unverified proposals to {args.report}; no catalog writes performed.")


if __name__ == "__main__":
    main()
