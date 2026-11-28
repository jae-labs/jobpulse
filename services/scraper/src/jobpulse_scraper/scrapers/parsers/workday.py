"""Pure Workday CXS listing normalization."""

import re
from typing import Any
from urllib.parse import urlsplit

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def workday_board_parts(url: str) -> tuple[str, str, str]:
    parsed = urlsplit(url)
    match = re.fullmatch(r"([^.]+)\.wd(\d+)\.myworkdayjobs\.com", parsed.hostname or "")
    if not match:
        raise ValueError("Invalid Workday board")
    tenant, generation = match.groups()
    parts = [part for part in parsed.path.split("/") if part]
    if parts[:2] == ["wday", "cxs"] and len(parts) >= 4 and parts[2] == tenant:
        site = parts[3]
    else:
        if parts and re.fullmatch(r"[a-zA-Z]{2}-[a-zA-Z]{2}", parts[0]):
            parts.pop(0)
        site = parts[0] if parts else ""
    if not re.fullmatch(r"[A-Za-z0-9_-]+", site):
        raise ValueError("Invalid Workday site")
    return tenant, generation, site


def ireland_workday_facets(payload: dict[str, Any]) -> dict[str, list[str]]:
    """Use the public board's own Irish country/location IDs, never guessed IDs."""
    from jobpulse_scraper.engine.location import is_explicit_ireland_location

    stack = list(payload.get("facets") or [])
    selected: dict[str, list[str]] = {}
    while stack:
        facet = stack.pop()
        if not isinstance(facet, dict):
            continue
        values = facet.get("values") or []
        parameter = facet.get("facetParameter")
        if parameter in {"locationCountry", "locations"}:
            ids = [
                entry["id"]
                for entry in values
                if isinstance(entry, dict)
                and isinstance(entry.get("id"), str)
                and len(entry["id"]) <= 128
                and is_explicit_ireland_location(str(entry.get("descriptor") or ""))
            ]
            if ids:
                if len(ids) > 128:
                    raise ValueError("Workday Irish facet exceeds request budget")
                selected[parameter] = ids
        stack.extend(entry for entry in values if isinstance(entry, dict) and "facetParameter" in entry)
    return {"locationCountry": selected["locationCountry"]} if "locationCountry" in selected else selected


def ireland_only_workday_scope(payload: dict[str, Any]) -> bool:
    """A returned facet containing only Irish locations proves country membership."""
    stack = list(payload.get("facets") or [])
    scopes: dict[str, bool] = {}
    while stack:
        facet = stack.pop()
        if not isinstance(facet, dict):
            continue
        values = facet.get("values") or []
        parameter = facet.get("facetParameter")
        if parameter in {"locationCountry", "locations"} and values:
            scopes[parameter] = all(
                isinstance(entry, dict) and is_explicit_ireland_location(str(entry.get("descriptor") or ""))
                for entry in values
            )
        stack.extend(entry for entry in values if isinstance(entry, dict) and "facetParameter" in entry)
    return scopes.get("locationCountry", scopes.get("locations", False))


def parse_workday_payload(company: str, listing_url: str, payload: Any) -> list[dict[str, Any]]:
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("jobPostings"), list)
        or not isinstance(payload.get("total"), int)
    ):
        raise ValueError("Invalid Workday listing")
    _, _, site = workday_board_parts(listing_url)
    host = urlsplit(listing_url).netloc
    country_proven = ireland_only_workday_scope(payload)
    jobs = {}
    for posting in payload["jobPostings"]:
        title = str(posting.get("title") or "").strip()
        location = posting.get("locationsText") or ""
        country_only = not is_explicit_ireland_location(location)
        ambiguous = not location or bool(
            re.fullmatch(r"(?:\d+|multiple)\s+locations?|remote|hybrid", location.strip(), re.I)
        )
        if country_only and not (country_proven and ambiguous):
            continue
        if country_only:
            location = "Ireland"
        path = posting.get("externalPath")
        if not title or not path:
            continue
        url = f"https://{host}/en-US/{site}{path}"
        description = f"{company} position: {title}. {posting.get('postedOn', '')} Requisition: {', '.join(posting.get('bulletFields', []))}."
        jobs[url] = {
            "title": title,
            "company": company,
            "location": location,
            "employment_type": "See job post",
            "salary_text": extract_salary_from_context(description, title),
            "description": description,
            "description_is_snippet": True,
            "url": url,
            "source": company,
            "external_id": str(path),
            "location_evidence": "workday_irish_facet" if country_only else "posting_location",
        }
    return list(jobs.values())
