"""Enrich employers with sector, size bracket, and Ireland office locations via agy LLM.

Usage:
  Preview:  uv run --locked python tools/enrich_companies_ai.py --limit 10
  Apply:    uv run --locked python tools/enrich_companies_ai.py --apply --limit 20
  Target:   uv run --locked python tools/enrich_companies_ai.py --apply --company "Stripe"
  Local:    uv run --locked python tools/enrich_companies_ai.py --apply --local --limit 5
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from supabase import Client, create_client

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.client import get_supabase, retry_supabase, utc_now
from database.records import response_records
from pipeline.ai_enrichment import EnrichedCompany, enrich_companies_with_ai

logger = logging.getLogger(__name__)


def get_local_supabase() -> Client:
    """Connect to local Supabase Docker stack using CLI status credentials."""
    try:
        status_raw = subprocess.check_output(["supabase", "status", "-o", "json"], text=True)
        status = json.loads(status_raw)
        url = status.get("API_URL", "http://127.0.0.1:54321")
        key = status.get("SERVICE_ROLE_KEY")
        if not key:
            raise RuntimeError("SERVICE_ROLE_KEY not found in local supabase status")
        return create_client(url, key)
    except Exception as exc:
        raise RuntimeError(f"Failed to connect to local Supabase: {exc}") from exc


def fetch_target_employers(
    client: Client,
    *,
    limit: int = 50,
    company_name: str | None = None,
    unknown_only: bool = True,
) -> list[dict[str, Any]]:
    """Fetch employers eligible for enrichment."""
    if company_name:
        query = client.table("employers").select("id,name,sector,size,website,description,metadata_source")
        query = query.ilike("name", company_name.strip())
        res = retry_supabase(query.execute)
        return response_records(res.data)

    query = client.table("employers").select("id,name,sector,size,website,description,metadata_source")
    if unknown_only:
        # Prioritize unverified or missing-size employers
        query = query.or_("metadata_source.eq.unverified,size.is.null,sector.eq.Uncategorized,sector.eq.General")
    query = query.order("id").limit(limit)
    res = retry_supabase(query.execute)
    return response_records(res.data)


def apply_company_enrichment(
    client: Client,
    employer: dict[str, Any],
    enriched: EnrichedCompany | dict[str, Any],
    *,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Persist enriched company metadata and physical Ireland offices."""
    eid = employer["id"]
    name = employer["name"]
    now_ts = utc_now()

    employer_update = {
        "size": enriched["size"],
        "enriched_at": now_ts,
        "metadata_source": "verified",
    }
    # Update sector if currently generic or unverified
    if (
        employer.get("sector") in ("Uncategorized", "General", "", None)
        or employer.get("metadata_source") == "unverified"
    ):
        employer_update["sector"] = enriched["sector"]

    # Fill in website/description if empty
    if not employer.get("website") and enriched.get("website"):
        employer_update["website"] = enriched["website"]
    if not employer.get("description") and enriched.get("description"):
        employer_update["description"] = enriched["description"]

    # LLM output is useful as a lead, but it is not location evidence. The
    # Geoapify office worker verifies offices against the employer and vacancy
    # location before it stores a map-eligible place.
    office_leads = []
    for off in enriched.get("offices", []):
        office_leads.append(
            {
                "employer_id": eid,
                "place_id": off["place_id"],
                "name": off["name"],
                "address": off["address"],
                "city": off["city"],
                "country_code": off["country_code"],
                "latitude": off["latitude"],
                "longitude": off["longitude"],
                "website": enriched.get("website"),
                "website_domain": enriched.get("website_domain"),
                "source": "ai_enrichment",
                "categories": [enriched["sector"]],
                "checked_at": now_ts,
            }
        )

    if not dry_run:
        # 1. Update employer
        retry_supabase(lambda: client.table("employers").update(employer_update).eq("id", eid).execute())

    return {
        "id": eid,
        "name": name,
        "sector": employer_update.get("sector", employer.get("sector")),
        "size": enriched["size"],
        "office_leads_count": len(office_leads),
        "office_leads": office_leads,
        "applied": not dry_run,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Max employers to process")
    parser.add_argument("--batch-size", type=int, default=25, help="Number of companies per prompt batch")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent AI prompt batches (1-4)")
    parser.add_argument("--timeout-seconds", type=int, default=300, help="Per-batch AI timeout (60-600)")
    parser.add_argument("--company", type=str, help="Specific company name to enrich")
    parser.add_argument("--all-employers", action="store_true", help="Include already verified employers")
    parser.add_argument("--apply", action="store_true", help="Commit changes to Supabase (default: dry-run)")
    parser.add_argument("--local", action="store_true", help="Connect to local Supabase stack")
    parser.add_argument("--report", type=Path, help="Save report to JSON file")
    parser.add_argument("--model", type=str, default="gemini-3.8-flash-low", help="Gemini model name")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 25:
        parser.error("--batch-size must be between 1 and 25")
    if not 1 <= args.workers <= 4:
        parser.error("--workers must be between 1 and 4")
    if not 60 <= args.timeout_seconds <= 600:
        parser.error("--timeout-seconds must be between 60 and 600")

    client = get_local_supabase() if args.local else get_supabase()

    employers = fetch_target_employers(
        client,
        limit=args.limit,
        company_name=args.company,
        unknown_only=not args.all_employers,
    )

    if not employers:
        print("No eligible employers found matching criteria.")
        return

    print(f"\nFound {len(employers)} employer(s) for AI enrichment (Dry run: {not args.apply})...")

    results: list[dict[str, Any]] = []
    batches = [employers[i : i + args.batch_size] for i in range(0, len(employers), args.batch_size)]
    # Each invocation is an independent CLI process. Bound concurrency to keep
    # subscription limits and local process pressure predictable.
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                enrich_companies_with_ai,
                [emp["name"] for emp in batch],
                model=args.model,
                timeout_seconds=args.timeout_seconds,
            ): (index, batch)
            for index, batch in enumerate(batches, start=1)
        }
        for future in as_completed(futures):
            index, batch = futures[future]
            names = [emp["name"] for emp in batch]
            try:
                enriched_list = future.result()
            except Exception as exc:
                logger.error("Failed to enrich batch %s: %s", names, exc)
                print(f"Error enriching batch {index}: {exc}")
                continue

            # Persist each batch as soon as its model call completes. This makes
            # long-running batches and later timeouts independent of saved work.
            print(f"\nProcessing batch {index}: {', '.join(names)}")
            enriched_by_name = {e["name"].casefold(): e for e in enriched_list}
            for emp in batch:
                name_key = emp["name"].casefold()
                match = enriched_by_name.get(name_key)
                if not match:
                    for key, candidate in enriched_by_name.items():
                        if key in name_key or name_key in key:
                            match = candidate
                            break
                if not match:
                    print(f"  [MISS] Could not map result for '{emp['name']}'")
                    continue
                res = apply_company_enrichment(client, emp, match, dry_run=not args.apply)
                results.append(res)
                print(
                    f"  {'[APPLIED]' if args.apply else '[PROPOSED]'} {res['name']}: "
                    f"Sector='{res['sector']}', Size='{res['size']}', "
                    f"Office leads in Ireland={res['office_leads_count']}"
                )
                for off in res["office_leads"]:
                    print(
                        f"    - {off['name']}: {off['address']}, {off['city']} ({off['latitude']}, {off['longitude']})"
                    )

    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_checked": len(employers),
        "total_enriched": len(results),
        "applied": args.apply,
        "results": results,
    }

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
        print(f"\nReport written to: {args.report}")

    print(f"\nFinished: Enriched {len(results)} of {len(employers)} employer(s).")


if __name__ == "__main__":
    main()
