"""AI-powered company and Ireland office enrichment using agy CLI prompt mode."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, NotRequired, TypedDict
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)

VALID_SIZES = ("1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+")

ENRICHMENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "companies": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "sector": {"type": "string"},
                    "size": {
                        "type": "string",
                        "enum": list(VALID_SIZES),
                    },
                    "description": {"type": "string"},
                    "website": {"type": "string"},
                    "offices": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "address": {"type": "string"},
                                "city": {"type": "string"},
                                "eircode": {"type": "string"},
                                "latitude": {"type": "number"},
                                "longitude": {"type": "number"},
                            },
                            "required": ["address", "city", "latitude", "longitude"],
                        },
                    },
                },
                "required": ["name", "sector", "size", "offices"],
            },
        },
    },
    "required": ["companies"],
}


class EnrichedOffice(TypedDict):
    name: str
    address: str
    city: str
    country_code: str
    eircode: NotRequired[str]
    latitude: float
    longitude: float
    place_id: str


class EnrichedCompany(TypedDict):
    name: str
    sector: str
    size: str
    description: str
    website: str
    website_domain: str | None
    offices: list[EnrichedOffice]


def find_agy_binary(custom_path: str | None = None) -> str:
    """Locate agy CLI executable."""
    if custom_path and shutil.which(custom_path):
        return custom_path
    resolved = shutil.which("agy")
    if resolved:
        return resolved
    fallback = str(Path.home() / ".local" / "bin" / "agy")
    if shutil.which(fallback):
        return fallback
    raise FileNotFoundError("agy CLI executable not found in PATH or standard location")


def slugify_name(name: str) -> str:
    """Produce a URL/ID-safe slug from a name."""
    cleaned = re.sub(r"[^\w\s-]", "", name.lower()).strip()
    return re.sub(r"[-\s]+", "-", cleaned)[:40] or "unknown"


def extract_domain(url: str | None) -> str | None:
    """Extract clean domain without www prefix."""
    if not url or not isinstance(url, str):
        return None
    try:
        parsed = urlsplit(url if "://" in url else f"https://{url}")
        host = parsed.hostname
        if host and "." in host:
            return host.lower().removeprefix("www.")
    except Exception:
        pass
    return None


def is_valid_ireland_coordinate(lat: float, lon: float) -> bool:
    """Verify coordinate falls approximately within the island of Ireland."""
    return 51.3 <= lat <= 55.6 and -10.8 <= lon <= -5.3


def enrich_companies_with_ai(
    company_names: list[str],
    *,
    model: str = "gemini-3.8-flash-low",
    agy_path: str | None = None,
    timeout_seconds: int = 120,
) -> list[EnrichedCompany]:
    """Enrich a batch of company names with sector, size, and Ireland offices via agy CLI."""
    if not company_names:
        return []

    binary = find_agy_binary(agy_path)
    companies_str = ", ".join(f'"{name}"' for name in company_names)

    prompt = (
        f"You are an expert Irish labor market and corporate registry research system.\n"
        f"For the following employers operating or hiring in Ireland: {companies_str}\n\n"
        f"Extract strictly verified factual details for each employer:\n"
        f"1. sector: Map to an accurate industry/domain (e.g. 'Fintech & Payments', 'Cloud & Platform Engineering', "
        f"'Data & AI', 'Cybersecurity', 'Biopharma & Life Sciences', 'Software & SaaS', 'Public Sector & Higher Ed', "
        f"'Telecommunications', 'E-commerce & Retail', etc.).\n"
        f"2. size: Global employee headcount bracket strictly chosen from: "
        f"['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'].\n"
        f"3. description: A concise 1-2 sentence description of their core business and offerings.\n"
        f"4. website: Official company website URL (e.g. 'https://stripe.com').\n"
        f"5. offices: List all known physical corporate offices, campus buildings, R&D labs, or manufacturing facilities "
        f"in the Republic of Ireland or Northern Ireland. Provide:\n"
        f"   - address: Full street address including building/park name if applicable.\n"
        f"   - city: City, town, or county (e.g. 'Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Athlone', 'Belfast').\n"
        f"   - eircode: Official Irish Eircode if known (e.g. 'D02 FX04').\n"
        f"   - latitude and longitude: Accurate GPS coordinates of the office in Ireland.\n"
        f"   If the company has no known physical office in Ireland (e.g. purely remote or US-only), return an empty list [].\n"
    )

    cmd = [
        binary,
        "-p",
        prompt,
        "--json-schema",
        json.dumps(ENRICHMENT_SCHEMA),
        "--output-format",
        "json",
        "--model",
        model,
        "--effort",
        "low",
        "--disable-slash-commands",
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=True,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"agy prompt timed out after {timeout_seconds}s for batch: {company_names}") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"agy CLI failed with code {exc.returncode}: {exc.stderr}") from exc

    try:
        raw_output = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to decode agy CLI stdout as JSON: {proc.stdout[:200]}") from exc

    structured = raw_output.get("structured_output")
    if not structured and "response" in raw_output:
        resp = raw_output["response"]
        structured = json.loads(resp) if isinstance(resp, str) else resp

    if not isinstance(structured, dict) or "companies" not in structured:
        raise ValueError(f"Unexpected response shape from agy: {raw_output.keys()}")

    results: list[EnrichedCompany] = []
    for item in structured.get("companies", []):
        name = item.get("name") or "Unknown"
        sector = item.get("sector") or "General"
        size = item.get("size")
        if size not in VALID_SIZES:
            size = "51-200"

        desc = (item.get("description") or "").strip()
        website = (item.get("website") or "").strip()
        domain = extract_domain(website)

        offices: list[EnrichedOffice] = []
        for off in item.get("offices", []):
            addr = (off.get("address") or "").strip()
            city = (off.get("city") or "").strip()
            if not addr:
                continue

            lat = float(off.get("latitude", 0.0))
            lon = float(off.get("longitude", 0.0))
            # Ireland coordinate validation: fallback to Dublin centre if out of range
            if not is_valid_ireland_coordinate(lat, lon):
                lat, lon = 53.3498, -6.2603

            addr_hash = hashlib.sha256(addr.encode("utf-8")).hexdigest()[:8]
            place_id = f"ie-office-{slugify_name(name)}-{addr_hash}"

            enriched_off: EnrichedOffice = {
                "name": (off.get("name") or f"{name} {city} Office").strip(),
                "address": addr,
                "city": city,
                "country_code": "IE",
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "place_id": place_id,
            }
            if off.get("eircode"):
                enriched_off["eircode"] = off["eircode"].strip()

            offices.append(enriched_off)

        results.append(
            {
                "name": name,
                "sector": sector,
                "size": size,
                "description": desc,
                "website": website,
                "website_domain": domain,
                "offices": offices,
            }
        )

    return results
