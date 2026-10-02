"""Resolve employer identities from exact database names and an explicit curated registry.

Employer addresses describe the company, never a vacancy. Unknown metadata stays
unknown; ingestion does not call external search or public geocoding services.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from pathlib import Path
from typing import Any

from database.client import get_supabase, retry_supabase

logger = logging.getLogger(__name__)
_CACHE_LOCK = threading.Lock()
_EMPLOYER_CACHE: dict[str, dict[str, Any]] = {}

CURATED_IRISH_EMPLOYERS: dict[str, dict[str, Any]] = {
    "kildare county council": {
        "name": "Kildare County Council",
        "sector": "Public service",
        "location": "Naas, Co. Kildare, Ireland",
        "latitude": 53.1762795,
        "longitude": -6.7987535,
        "description": "Local government authority for County Kildare in Ireland",
        "website": "https://kildarecoco.ie",
    },
    "dublin city council": {
        "name": "Dublin City Council",
        "sector": "Public service",
        "location": "Dublin, Ireland",
        "latitude": 53.344104,
        "longitude": -6.267493,
        "description": "Local government authority for the city of Dublin",
        "website": "https://dublincity.ie",
    },
    "maynooth university": {
        "name": "Maynooth University",
        "sector": "Higher education",
        "location": "Maynooth, Co. Kildare, Ireland",
        "latitude": 53.3821766,
        "longitude": -6.5987338,
        "description": "Constituent university of the National University of Ireland",
        "website": "https://maynoothuniversity.ie",
    },
    "trinity college dublin": {
        "name": "Trinity College Dublin",
        "sector": "Higher education",
        "location": "Dublin, Ireland",
        "latitude": 53.343793,
        "longitude": -6.254571,
        "description": "Sole constituent college of the University of Dublin",
        "website": "https://tcd.ie",
    },
    "university college dublin": {
        "name": "University College Dublin",
        "sector": "Higher education",
        "location": "Belfield, Dublin, Ireland",
        "latitude": 53.307521,
        "longitude": -6.222329,
        "description": "Public research university in Dublin, Ireland",
        "website": "https://ucd.ie",
    },
    "university of galway": {
        "name": "University of Galway",
        "sector": "Higher education",
        "location": "Galway, Ireland",
        "latitude": 53.278333,
        "longitude": -9.059444,
        "description": "Public research university located in the city of Galway",
        "website": "https://universityofgalway.ie",
    },
    "university of limerick": {
        "name": "University of Limerick",
        "sector": "Higher education",
        "location": "Limerick, Ireland",
        "latitude": 52.673889,
        "longitude": -8.572222,
        "description": "Higher education institution in Limerick, Ireland",
        "website": "https://ul.ie",
    },
    "intel": {
        "name": "Intel",
        "sector": "Semiconductors & Technology",
        "location": "Leixlip, Co. Kildare, Ireland",
        "latitude": 53.3765245,
        "longitude": -6.5188977,
        "description": "Semiconductor chip manufacturer campus in Leixlip, Ireland",
        "website": "https://intel.com",
    },
    "stripe": {
        "name": "Stripe",
        "sector": "FinTech & Payments",
        "location": "Grand Canal Dock, Dublin, Ireland",
        "latitude": 53.3398868,
        "longitude": -6.2431584,
        "description": "Financial infrastructure and online payments technology company",
        "website": "https://stripe.com",
    },
    "workday": {
        "name": "Workday",
        "sector": "Enterprise Software",
        "location": "Kings Building, Dublin, Ireland",
        "latitude": 53.3477971,
        "longitude": -6.275054,
        "description": "Cloud applications for finance and human resources",
        "website": "https://workday.com",
    },
    "google": {
        "name": "Google",
        "sector": "Technology",
        "location": "Barrow Street, Dublin, Ireland",
        "latitude": 53.3404,
        "longitude": -6.2372,
        "description": "Multinational technology and search company European headquarters",
        "website": "https://google.com",
    },
    "meta": {
        "name": "Meta",
        "sector": "Technology",
        "location": "Ballsbridge, Dublin, Ireland",
        "latitude": 53.3283,
        "longitude": -6.2289,
        "description": "Social technology and metaverse company international headquarters",
        "website": "https://meta.com",
    },
    "amazon": {
        "name": "Amazon",
        "sector": "Cloud & Technology",
        "location": "Burlington Plaza, Dublin, Ireland",
        "latitude": 53.3308,
        "longitude": -6.2575,
        "description": "Cloud computing and e-commerce multinational campus",
        "website": "https://amazon.com",
    },
    "microsoft": {
        "name": "Microsoft",
        "sector": "Cloud & Software",
        "location": "Leopardstown, Dublin, Ireland",
        "latitude": 53.2709,
        "longitude": -6.1978,
        "description": "One Microsoft Court technology campus",
        "website": "https://microsoft.com",
    },
    "apple": {
        "name": "Apple",
        "sector": "Technology & Hardware",
        "location": "Hollyhill, Cork, Ireland",
        "latitude": 51.9036,
        "longitude": -8.5144,
        "description": "European operations and campus in Cork",
        "website": "https://apple.com",
    },
    "pfizer": {
        "name": "Pfizer",
        "sector": "Life sciences & Pharma",
        "location": "Ringaskiddy, Co. Cork, Ireland",
        "latitude": 51.8347,
        "longitude": -8.3241,
        "description": "Biopharmaceutical manufacturing and research in Ireland",
        "website": "https://pfizer.com",
    },
    "kerry": {
        "name": "Kerry Group",
        "sector": "Food and nutrition",
        "location": "Tralee, Co. Kerry, Ireland",
        "latitude": 52.2713,
        "longitude": -9.7026,
        "description": "Global taste and nutrition company headquartered in Tralee",
        "website": "https://kerry.com",
    },
    "aib": {
        "name": "AIB",
        "sector": "Financial services",
        "location": "Molesworth Street, Dublin, Ireland",
        "latitude": 53.3409,
        "longitude": -6.2567,
        "description": "Major commercial and retail bank in Ireland",
        "website": "https://aib.ie",
    },
    "bank of ireland": {
        "name": "Bank of Ireland",
        "sector": "Financial services",
        "location": "Baggot Plaza, Dublin, Ireland",
        "latitude": 53.3344,
        "longitude": -6.2464,
        "description": "Commercial bank operation across Ireland and Europe",
        "website": "https://bankofireland.com",
    },
    "an post": {
        "name": "An Post",
        "sector": "Postal & Financial services",
        "location": "GPO, O'Connell Street, Dublin, Ireland",
        "latitude": 53.3498,
        "longitude": -6.2603,
        "description": "State-owned provider of postal and financial services in Ireland",
        "website": "https://anpost.com",
    },
    "esb": {
        "name": "ESB",
        "sector": "Energy & Utilities",
        "location": "Fitzwilliam Street, Dublin, Ireland",
        "latitude": 53.3369,
        "longitude": -6.2466,
        "description": "Electricity supply board and renewable energy operator in Ireland",
        "website": "https://esb.ie",
    },
    "hse": {
        "name": "HSE",
        "sector": "Healthcare",
        "location": "Dr Steevens' Hospital, Dublin, Ireland",
        "latitude": 53.3429,
        "longitude": -6.2948,
        "description": "Health Service Executive providing public healthcare services in Ireland",
        "website": "https://hse.ie",
    },
    "circle k": {
        "name": "Circle K Ireland",
        "sector": "Retail and Forecourt Services",
        "location": "Beech Hill, Clonskeagh, Dublin, Ireland",
        "latitude": 53.3114,
        "longitude": -6.2341,
        "description": "Retail fuel and convenience store chain across Ireland",
        "website": "https://circlek.ie",
    },
    "sodexo": {
        "name": "Sodexo Ireland",
        "sector": "Facilities Management & Catering",
        "location": "South County Business Park, Leopardstown, Dublin, Ireland",
        "latitude": 53.2709,
        "longitude": -6.1978,
        "description": "Facilities management and corporate food services provider",
        "website": "https://sodexo.ie",
    },
    "glanua": {
        "name": "Glanua",
        "sector": "Engineering & Water Infrastructure",
        "location": "Loughrea, Co. Galway, Ireland",
        "latitude": 53.1972,
        "longitude": -8.5701,
        "description": "Water and wastewater engineering and environmental solutions",
        "website": "https://glanua.com",
    },
    "comfort keepers": {
        "name": "Comfort Keepers",
        "sector": "Healthcare & Domiciliary Care",
        "location": "Sandyford, Dublin, Ireland",
        "latitude": 53.2758,
        "longitude": -6.2114,
        "description": "Home care and clinical support services provider across Ireland",
        "website": "https://comfortkeepers.ie",
    },
    "crewit resourcing": {
        "name": "Crewit Resourcing",
        "sector": "Recruitment & Staffing",
        "location": "Dublin, Ireland",
        "latitude": 53.3498,
        "longitude": -6.2603,
        "description": "Engineering, construction, and technical workforce recruitment",
        "website": "https://crewitresourcing.com",
    },
    "atlantic aviation": {
        "name": "Atlantic Aviation Group",
        "sector": "Aviation Operations & MRO",
        "location": "Shannon Airport, Co. Clare, Ireland",
        "latitude": 52.7019,
        "longitude": -8.9248,
        "description": "Aircraft maintenance, continuous airworthiness, and aerospace training",
        "website": "https://atlanticaviation.ie",
    },
    "resilience healthcare": {
        "name": "Resilience Healthcare",
        "sector": "Healthcare & Social Care",
        "location": "Ennis, Co. Clare, Ireland",
        "latitude": 52.8436,
        "longitude": -8.9863,
        "description": "Advanced community care and social healthcare services",
        "website": "https://resilience.ie",
    },
    "irish homecare": {
        "name": "Irish HomeCare",
        "sector": "Healthcare & Community Care",
        "location": "Castleblayney, Co. Monaghan, Ireland",
        "latitude": 54.1167,
        "longitude": -6.7333,
        "description": "Dedicated domiciliary and palliative home care provider",
        "website": "https://irishhomecare.ie",
    },
    "western alzheimers": {
        "name": "Western Alzheimers",
        "sector": "Healthcare & Community Care",
        "location": "Ballindine, Co. Mayo, Ireland",
        "latitude": 53.6702,
        "longitude": -8.9567,
        "description": "Community respite and in-home dementia care across Western Ireland",
        "website": "https://westernalzheimers.ie",
    },
    "accenture": {
        "name": "Accenture",
        "sector": "Professional Services & IT Consulting",
        "location": "Grand Canal Dock, Dublin, Ireland",
        "latitude": 53.3421,
        "longitude": -6.2412,
        "description": "Global professional services and management consulting firm",
        "website": "https://accenture.com",
    },
    "deloitte": {
        "name": "Deloitte",
        "sector": "Professional Services & Advisory",
        "location": "Hatch Street, Dublin, Ireland",
        "latitude": 53.3341,
        "longitude": -6.2584,
        "description": "Audit, consulting, financial advisory, and tax services",
        "website": "https://deloitte.com/ie",
    },
    "kpmg": {
        "name": "KPMG",
        "sector": "Professional Services & Audit",
        "location": "Stokes Place, St Stephen's Green, Dublin, Ireland",
        "latitude": 53.3364,
        "longitude": -6.2592,
        "description": "Audit, tax, and advisory services provider",
        "website": "https://kpmg.ie",
    },
    "pwc": {
        "name": "PwC",
        "sector": "Professional Services & Audit",
        "location": "One Spencer Dock, North Wall Quay, Dublin, Ireland",
        "latitude": 53.3478,
        "longitude": -6.2405,
        "description": "Assurance, tax, and consulting services network",
        "website": "https://pwc.ie",
    },
    "ey": {
        "name": "EY",
        "sector": "Professional Services & Advisory",
        "location": "Harcourt Street, Dublin, Ireland",
        "latitude": 53.3348,
        "longitude": -6.2625,
        "description": "Assurance, consulting, strategy, and tax services firm",
        "website": "https://ey.com/en_ie",
    },
    "ryanair": {
        "name": "Ryanair",
        "sector": "Aviation & Travel",
        "location": "Airside Business Park, Swords, Co. Dublin, Ireland",
        "latitude": 53.4566,
        "longitude": -6.2231,
        "description": "Low-cost airline group headquartered in Swords, Ireland",
        "website": "https://ryanair.com",
    },
    "aer lingus": {
        "name": "Aer Lingus",
        "sector": "Aviation & Travel",
        "location": "Dublin Airport, Co. Dublin, Ireland",
        "latitude": 53.4264,
        "longitude": -6.2499,
        "description": "Flag carrier airline of Ireland headquartered at Dublin Airport",
        "website": "https://aerlingus.com",
    },
    "dunnes stores": {
        "name": "Dunnes Stores",
        "sector": "Retail & Fashion",
        "location": "George's Street, Dublin, Ireland",
        "latitude": 53.3423,
        "longitude": -6.2647,
        "description": "Irish retail chain selling groceries, fashion, and homewares",
        "website": "https://dunnesstores.com",
    },
    "supervalu": {
        "name": "SuperValu",
        "sector": "Retail & Supermarket",
        "location": "Tramore Road, Cork, Ireland",
        "latitude": 51.8711,
        "longitude": -8.4721,
        "description": "Supermarket chain operated by the Musgrave Group",
        "website": "https://supervalu.ie",
    },
    "centra": {
        "name": "Centra",
        "sector": "Retail & Convenience",
        "location": "Tramore Road, Cork, Ireland",
        "latitude": 51.8711,
        "longitude": -8.4721,
        "description": "Convenience store network operated by Musgrave Group",
        "website": "https://centra.ie",
    },
    "spar": {
        "name": "SPAR Ireland",
        "sector": "Retail & Convenience",
        "location": "Walkinstown, Dublin, Ireland",
        "latitude": 53.3182,
        "longitude": -6.3456,
        "description": "Convenience grocery store franchise network in Ireland",
        "website": "https://spar.ie",
    },
    "lidl": {
        "name": "Lidl Ireland",
        "sector": "Retail & Supermarket",
        "location": "Main Road, Tallaght, Dublin, Ireland",
        "latitude": 53.2863,
        "longitude": -6.3742,
        "description": "Discount supermarket chain operations across Ireland",
        "website": "https://lidl.ie",
    },
    "aldi": {
        "name": "Aldi Ireland",
        "sector": "Retail & Supermarket",
        "location": "Naas, Co. Kildare, Ireland",
        "latitude": 53.2181,
        "longitude": -6.6669,
        "description": "Supermarket retail headquarters in Naas, County Kildare",
        "website": "https://aldi.ie",
    },
    "vodafone": {
        "name": "Vodafone Ireland",
        "sector": "Telecommunications",
        "location": "Mountainview, Leopardstown, Dublin, Ireland",
        "latitude": 53.2687,
        "longitude": -6.2001,
        "description": "Mobile network operator and broadband services provider",
        "website": "https://vodafone.ie",
    },
    "eir": {
        "name": "eir",
        "sector": "Telecommunications",
        "location": "1 Heuston South Quarter, Dublin, Ireland",
        "latitude": 53.3451,
        "longitude": -6.2941,
        "description": "Fixed, mobile, and broadband telecommunications provider",
        "website": "https://eir.ie",
    },
    "salesforce": {
        "name": "Salesforce",
        "sector": "Enterprise Software & Cloud",
        "location": "Salesforce Tower, North Wall Quay, Dublin, Ireland",
        "latitude": 53.3472,
        "longitude": -6.2345,
        "description": "Cloud-based customer relationship management platform",
        "website": "https://salesforce.com",
    },
    "hubspot": {
        "name": "HubSpot",
        "sector": "Enterprise Software & Marketing",
        "location": "One Dockland Central, Dublin, Ireland",
        "latitude": 53.3456,
        "longitude": -6.2384,
        "description": "Inbound marketing, sales, and customer service software",
        "website": "https://hubspot.com",
    },
    "boston scientific": {
        "name": "Boston Scientific",
        "sector": "Medical Devices & Healthcare",
        "location": "Ballybrit, Galway, Ireland",
        "latitude": 53.2917,
        "longitude": -9.0064,
        "description": "Biomedical engineering and medical device manufacturing",
        "website": "https://bostonscientific.com",
    },
    "medtronic": {
        "name": "Medtronic",
        "sector": "Medical Devices & Healthcare",
        "location": "Parkmore, Galway, Ireland",
        "latitude": 53.2982,
        "longitude": -8.9951,
        "description": "Medical device manufacturer European operational headquarters",
        "website": "https://medtronic.com",
    },
    "abbott": {
        "name": "Abbott Ireland",
        "sector": "Healthcare & Medical Devices",
        "location": "Clonmel, Co. Tipperary, Ireland",
        "latitude": 52.3556,
        "longitude": -7.7039,
        "description": "Pharmaceuticals, medical devices, and nutritional diagnostics",
        "website": "https://abbott.ie",
    },
    "analog devices": {
        "name": "Analog Devices",
        "sector": "Semiconductors & Technology",
        "location": "Raheen Business Park, Limerick, Ireland",
        "latitude": 52.6312,
        "longitude": -8.6601,
        "description": "Semiconductor manufacturing and precision analog circuitry",
        "website": "https://analog.com",
    },
}


def normalize_company_key(company: str) -> str:
    """Normalize explicit registry aliases, removing trailing legal suffixes only."""
    name = " ".join(re.sub(r"[^a-z0-9]+", " ", company.casefold()).split())
    return re.sub(r"(?:\s+(?:ireland|limited|ltd|plc|dac|inc|corp|corporation|group|llc))+$", "", name).strip()


def load_evidence_registry(path: Path | None = None) -> dict[str, dict[str, Any]]:
    """Reviewed first-party facts, keyed by explicit full aliases only.

    Missing or conflicting evidence is a configuration error, never a sector guess.
    These addresses describe employers. Coordinates require separate evidence.
    """
    path = path or Path(__file__).resolve().parent.parent / "config" / "employer_evidence.json"
    records = json.loads(path.read_text(encoding="utf-8"))
    registry = {}
    for record in records:
        if not record.get("sources") or not record.get("checked_on") or not record.get("sector"):
            raise ValueError("Employer evidence requires sources, observation date and sector")
        latitude, longitude = record.get("latitude"), record.get("longitude")
        if latitude is not None or longitude is not None:
            if (
                isinstance(latitude, bool)
                or isinstance(longitude, bool)
                or not isinstance(latitude, (int, float))
                or not isinstance(longitude, (int, float))
                or not -90 <= latitude <= 90
                or not -180 <= longitude <= 180
                or not record.get("location")
                or not record.get("coordinate_sources")
                or not all(url in record["sources"] for url in record["coordinate_sources"])
            ):
                raise ValueError("Employer coordinates require a valid pair, address and separate source evidence")
        for alias in record["aliases"]:
            key = " ".join(alias.split()).casefold()
            if key in registry:
                raise ValueError("Duplicate employer evidence alias")
            registry[key] = {**record, "latitude": latitude, "longitude": longitude}
    return registry


EVIDENCED_EMPLOYERS = load_evidence_registry()


def curated_employer(company_name: str) -> dict[str, Any] | None:
    clean_name = " ".join(company_name.split()).casefold()
    if clean_name in {"jobsireland employer", "employer", "confidential", "undisclosed"}:
        return None
    return EVIDENCED_EMPLOYERS.get(clean_name) or CURATED_IRISH_EMPLOYERS.get(normalize_company_key(company_name))


class EmployerLookupService:
    """Exact identity resolution; failed writes are retried on subsequent calls."""

    def __init__(self, client: Any = None) -> None:
        self._supabase = client if client is not None else get_supabase()

    def lookup_employer_in_db(self, name: str) -> dict[str, Any] | None:
        # ILIKE without surrounding wildcards supports case differences only.
        literal = name.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        rows = (
            retry_supabase(
                lambda: self._supabase.table("employers").select("*").ilike("name", literal).limit(2).execute()
            ).data
            or []
        )
        if len(rows) > 1:
            raise ValueError("Ambiguous employer identity")
        return rows[0] if rows else None

    def resolve_employer(
        self, company_name: str, careers_url: str = "", scraped_location: str = "", *, persist: bool = True
    ) -> dict[str, Any] | None:
        """Resolve metadata without treating a scraped vacancy location as headquarters.

        persist=False performs reads only, including on a cache miss.
        """
        clean_name = " ".join((company_name or "").split())
        if not clean_name or clean_name.casefold() in {
            "jobsireland employer",
            "employer",
            "confidential",
            "undisclosed",
        }:
            return None
        cache_key = clean_name.casefold()
        with _CACHE_LOCK:
            cached = _EMPLOYER_CACHE.get(cache_key)
        if cached:
            return cached
        curated = curated_employer(clean_name)
        canonical_name = curated["name"] if curated else clean_name
        existing = self.lookup_employer_in_db(canonical_name)
        if existing:
            # Only an explicit registry entry can upgrade legacy guessed metadata.
            if curated and existing.get("metadata_source") == "unverified":
                evidence = {
                    key: curated[key]
                    for key in ("sector", "location", "latitude", "longitude", "description", "website")
                }
                evidence["metadata_source"] = "curated"
                if persist:
                    rows = (
                        retry_supabase(
                            lambda: (
                                self._supabase.table("employers")
                                .update(evidence)
                                .eq("id", existing["id"])
                                .eq("metadata_source", "unverified")
                                .execute()
                            )
                        ).data
                        or []
                    )
                    existing = rows[0] if rows else self.lookup_employer_in_db(canonical_name)
                else:
                    existing = {**existing, **evidence}
            if existing and persist:
                with _CACHE_LOCK:
                    _EMPLOYER_CACHE[cache_key] = existing
            return existing
        payload = {
            "name": canonical_name,
            "sector": curated["sector"] if curated else "Uncategorized",
            "metadata_source": "curated" if curated else "unverified",
            "location": curated["location"] if curated else None,
            "latitude": curated["latitude"] if curated else None,
            "longitude": curated["longitude"] if curated else None,
            "description": curated["description"] if curated else None,
            "website": curated["website"] if curated else None,
            "careers_url": careers_url or "",
            "status": "discovered",
            "priority": 50,
        }
        if not persist:
            return payload
        try:
            rows = retry_supabase(lambda: self._supabase.table("employers").insert(payload).execute()).data or []
            created = rows[0] if rows else self.lookup_employer_in_db(canonical_name)
        except Exception:
            # A concurrent insert can win; other failures must not poison the cache.
            created = self.lookup_employer_in_db(canonical_name)
        if created and created.get("id") is not None:
            with _CACHE_LOCK:
                _EMPLOYER_CACHE[cache_key] = created
            return created
        return None

    def resolve_batch(self, companies: list[str]) -> dict[str, dict[str, Any]]:
        results = {}
        for company in sorted(set(companies)):
            employer = self.resolve_employer(company)
            if employer:
                results[company] = employer
        return results


_default_service: EmployerLookupService | None = None


def get_employer_lookup_service() -> EmployerLookupService:
    global _default_service
    if _default_service is None:
        _default_service = EmployerLookupService()
    return _default_service
