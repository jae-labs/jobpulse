"""Employer metadata lookup, geocoding, and database synchronization.

Maintains a persistent database of employers in Supabase (sector, location, coordinates).
Checks existing database records first; queries Wikidata & OpenStreetMap only for missing
employers, then caches them permanently.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import urllib.parse
import urllib.request
from typing import Any

from database.client import get_supabase, retry_supabase
from engine.text_cleaner import normalize_location

logger = logging.getLogger(__name__)

_CACHE_LOCK = threading.Lock()
_EMPLOYER_CACHE: dict[str, dict[str, Any]] = {}
_LAST_EXTERNAL_CALL_TIME = 0.0
_EXTERNAL_CALL_MIN_INTERVAL = 1.0  # Respect Nominatim 1 req/sec policy

USER_AGENT = "JobPulse/1.0 (https://jobpulse.dev; opportunities@jobpulse.dev)"

# Curated Irish anchors for instant, 0ms, zero-network resolution of common employers
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
    "jobsireland employer": {
        "name": "JobsIreland Employer",
        "sector": "Public Employment Service",
        "location": "Dublin, Ireland",
        "latitude": 53.3501,
        "longitude": -6.2575,
        "description": "National employment service verified employer vacancy",
        "website": "https://jobsireland.ie",
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
    """Standardize company name for uniform dictionary and database indexing."""
    if not company:
        return ""
    c = company.lower().strip()
    c = re.sub(r"\b(?:ireland|limited|ltd|plc|dac|inc|corp|corporation|group|llc|holdings|company|co)\b", " ", c)
    c = re.sub(r"[^a-z0-9]+", " ", c).strip()
    return c


def _rate_limit_external_call() -> None:
    """Enforce gentle rate limits on external open API requests."""
    global _LAST_EXTERNAL_CALL_TIME
    now = time.time()
    elapsed = now - _LAST_EXTERNAL_CALL_TIME
    if elapsed < _EXTERNAL_CALL_MIN_INTERVAL:
        time.sleep(_EXTERNAL_CALL_MIN_INTERVAL - elapsed)
    _LAST_EXTERNAL_CALL_TIME = time.time()


def _query_wikidata_entity(company: str) -> tuple[str, str, str] | None:
    """Query Wikidata for company description, inferred sector, and website."""
    query = urllib.parse.quote(company)
    url = f"https://www.wikidata.org/w/api.php?action=wbsearchentities&search={query}&language=en&format=json&limit=3"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        _rate_limit_external_call()
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("search", [])
            for r in results:
                desc = (r.get("description") or "").strip()
                desc_l = desc.lower()
                if any(
                    k in desc_l
                    for k in (
                        "company",
                        "corporation",
                        "bank",
                        "university",
                        "authority",
                        "service",
                        "software",
                        "firm",
                        "enterprise",
                        "organization",
                        "agency",
                    )
                ):
                    sector = _infer_sector_from_description(desc)
                    website = ""
                    return desc, sector, website
    except Exception as exc:
        logger.debug("Wikidata query for '%s' failed: %s", company, exc)
    return None


def _infer_sector_from_description(desc: str) -> str:
    """Map free-text entity description to canonical industry sector."""
    d = desc.lower()
    if re.search(r"\b(council|local government|public sector|public service|state body|government agency)\b", d):
        return "Public service"
    if re.search(r"\b(university|college|school|higher education|polytechnic)\b", d):
        return "Higher education"
    if re.search(r"\b(payment|payments|fintech|banking|bank|finance|financial|investment|credit)\b", d):
        return "Financial services"
    if re.search(r"\b(pharma|pharmaceutical|biotech|life sciences|medical device|medicine)\b", d):
        return "Life sciences"
    if re.search(r"\b(health|hospital|clinic|healthcare|medical)\b", d):
        return "Healthcare"
    if re.search(r"\b(semiconductor|semiconductors|chip|microchip|hardware)\b", d):
        return "Semiconductors & Hardware"
    if re.search(r"\b(retail|store|supermarket|grocery|shop)\b", d):
        return "Retail"
    if re.search(r"\b(energy|power|utility|utilities|electricity|renewables|renewable energy)\b", d):
        return "Energy & Utilities"
    if re.search(r"\b(airline|airlines|aviation|transport|logistics|freight)\b", d):
        return "Transport & Logistics"
    if re.search(r"\b(food|beverage|nutrition|dairy|brewery)\b", d):
        return "Food and nutrition"
    if re.search(r"\b(cloud|software|saas|tech|technology|computing|ai|artificial intelligence|platform)\b", d):
        return "Technology & Software"
    return "Technology & Services"


def _query_nominatim_location(query_term: str) -> tuple[str, float, float] | None:
    """Query OpenStreetMap Nominatim for Irish address and lat/lon coordinates."""
    q = urllib.parse.quote(query_term)
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        _rate_limit_external_call()
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0:
                item = data[0]
                lat = float(item["lat"])
                lon = float(item["lon"])
                display = item.get("display_name", "")
                parts = [p.strip() for p in display.split(",")]
                if len(parts) >= 3:
                    loc = f"{parts[0]}, {parts[-3] if len(parts) > 3 else parts[1]}, Ireland"
                else:
                    loc = display
                return loc, lat, lon
    except Exception as exc:
        logger.debug("Nominatim geocoding for '%s' failed: %s", query_term, exc)
    return None


class EmployerLookupService:
    """Resolves and caches employer metadata, ensuring no redundant lookups."""

    def __init__(self) -> None:
        self._supabase = get_supabase()

    def lookup_employer_in_db(self, name: str) -> dict[str, Any] | None:
        """Fetch existing employer row from Supabase by exact name or ILIKE match."""
        try:
            # 1. Exact match
            res = (
                retry_supabase(
                    lambda: self._supabase.table("employers").select("*").eq("name", name.strip()).limit(1).execute()
                ).data
                or []
            )
            if res:
                return res[0]

            # 2. ILIKE match
            res = (
                retry_supabase(
                    lambda: (
                        self._supabase.table("employers")
                        .select("*")
                        .ilike("name", f"%{name.strip()}%")
                        .limit(1)
                        .execute()
                    )
                ).data
                or []
            )
            return res[0] if res else None
        except Exception as exc:
            logger.warning("Database lookup for employer '%s' failed: %s", name, exc)
            return None

    def resolve_employer(
        self,
        company_name: str,
        careers_url: str = "",
        scraped_location: str = "",
    ) -> dict[str, Any] | None:
        """
        Resolve an employer's metadata (id, sector, location, coordinates).
        Uses in-memory cache -> database table -> curated registry -> external lookups.
        Persists newly discovered employers so they are never queried externally again.
        """
        clean_name = (company_name or "").strip()
        if not clean_name or clean_name.lower() in ("employer", "confidential", "undisclosed"):
            return None

        norm_key = normalize_company_key(clean_name)
        if not norm_key:
            return None

        # 1. Check in-memory session cache
        with _CACHE_LOCK:
            cached = _EMPLOYER_CACHE.get(norm_key)
            if cached:
                return cached

        # 2. Check persistent database
        db_emp = self.lookup_employer_in_db(clean_name)
        if db_emp:
            with _CACHE_LOCK:
                _EMPLOYER_CACHE[norm_key] = db_emp
            return db_emp

        # 3. Check curated Irish employers registry
        curated = CURATED_IRISH_EMPLOYERS.get(norm_key)
        if curated:
            sector = curated["sector"]
            location = curated["location"]
            latitude = curated["latitude"]
            longitude = curated["longitude"]
            description = curated["description"]
            website = curated["website"]
        else:
            # 4. External resolution for previously unseen employers
            sector = "General"
            description = ""
            website = ""
            latitude = None
            longitude = None
            location = normalize_location(scraped_location) if scraped_location else "Ireland"

            # 4a. Query Wikidata for sector and entity summary
            wiki_result = _query_wikidata_entity(clean_name)
            if wiki_result:
                description, sector, website = wiki_result

            # 4b. Query Nominatim for location & coordinates
            geo_result = _query_nominatim_location(f"{clean_name}, Ireland")
            if not geo_result and scraped_location and scraped_location.lower() not in ("ireland", "not specified"):
                geo_result = _query_nominatim_location(f"{scraped_location}, Ireland")

            if geo_result:
                location, latitude, longitude = geo_result

        # 5. Persist to employers table so it remains permanent
        insert_payload = {
            "name": clean_name,
            "sector": sector,
            "location": location,
            "latitude": latitude,
            "longitude": longitude,
            "description": description or None,
            "careers_url": careers_url or "",
            "website": website or None,
            "status": "discovered",
            "priority": 50,
        }

        try:
            persisted = (
                retry_supabase(lambda: self._supabase.table("employers").insert(insert_payload).execute()).data or []
            )
            if persisted:
                created = persisted[0]
            else:
                created = self.lookup_employer_in_db(clean_name) or insert_payload
        except Exception as exc:
            logger.info("Employer '%s' insert on conflict fallback: %s", clean_name, exc)
            created = self.lookup_employer_in_db(clean_name) or insert_payload

        with _CACHE_LOCK:
            _EMPLOYER_CACHE[norm_key] = created

        return created

    def resolve_batch(self, companies: list[str]) -> dict[str, dict[str, Any]]:
        """Resolve a batch of company names, returning a mapping of company -> employer."""
        results: dict[str, dict[str, Any]] = {}
        for c in set(companies):
            resolved = self.resolve_employer(c)
            if resolved:
                results[c] = resolved
        return results


_default_service: EmployerLookupService | None = None


def get_employer_lookup_service() -> EmployerLookupService:
    """Return singleton instance of EmployerLookupService."""
    global _default_service
    if _default_service is None:
        _default_service = EmployerLookupService()
    return _default_service
