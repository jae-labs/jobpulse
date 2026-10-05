"""Generate unverified company research proposals via agy; never write catalog data.

Review first-party field evidence and apply it through tools/enrich_employers.py --registry.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase, retry_supabase
from database.records import response_records
from pipeline.ai_enrichment import enrich_companies_with_ai


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Employers to propose (1-25)")
    parser.add_argument("--report", type=Path, required=True, help="Unverified JSON proposal destination")
    parser.add_argument("--model", default="gemini-3.8-flash-low", help="agy model")
    args = parser.parse_args()
    if not 1 <= args.limit <= 25:
        parser.error("--limit must be between 1 and 25")

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
        proposals = enrich_companies_with_ai([employer["name"] for employer in employers], model=args.model)
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
        print(f"Company research failed: {exc}", file=sys.stderr)
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
