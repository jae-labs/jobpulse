"""Location filtering shared by provider adapters."""

from __future__ import annotations

import re

IRELAND_LOCATION_KEYWORDS = [
    "ireland",
    "dublin",
    "cork",
    "kildare",
    "leixlip",
    "galway",
    "limerick",
    "waterford",
    "grange castle",
    "ringsend",
    "ringaskiddy",
    "shannon",
    "athlone",
    "kilkenny",
    "sligo",
    "drogheda",
    "dundalk",
    "tralee",
    "ennis",
    "letterkenny",
    "wexford",
    "mullingar",
    "naas",
    "maynooth",
    "carlow",
    " ie",
    "(ie)",
    ", ie",
    "- ie",
    "/ie",
]

NON_IRELAND_STRONG_SIGNALS = [
    "united states",
    "usa",
    "u.s.",
    "california",
    "new york",
    "texas",
    "united kingdom",
    "london",
    "manchester",
    "england",
    "scotland",
    "germany",
    "berlin",
    "munich",
    "france",
    "paris",
    "spain",
    "madrid",
    "netherlands",
    "amsterdam",
    "poland",
    "warsaw",
    "india",
    "bangalore",
    "singapore",
    "australia",
    "sydney",
    "canada",
    "toronto",
    "japan",
    "tokyo",
    "china",
    "brazil",
    "mexico",
    "colombia",
    "argentina",
    "chile",
    "italy",
    "sweden",
    "norway",
    "denmark",
    "finland",
    "austria",
    "switzerland",
    "belgium",
    "czech republic",
    "portugal",
    "romania",
    "hungary",
    "bulgaria",
    "israel",
    "united arab emirates",
    "uae",
    "dubai",
    "philippines",
    "new zealand",
    "remote - us",
    "remote, us",
    "remote (us)",
    "remote - usa",
    ", ca",
    ", ny",
    ", tx",
    ", wa",
    ", ma",
    ", ut",
    ", il",
    ", fl",
    ", oh",
    ", nc",
    ", ga",
]


def is_ireland_location(location_text: str) -> bool:
    """Keep Irish or location-unspecified postings; reject known foreign locations."""
    text = (location_text or "").strip().lower()
    if not text:
        return True
    if re.search(r"\bdublin\s*,\s*(?:oh|ca|va|ga|texas|tx|ohio)\b", text):
        return False
    if any(keyword in text for keyword in IRELAND_LOCATION_KEYWORDS):
        return True
    return not any(signal in text for signal in NON_IRELAND_STRONG_SIGNALS)


def is_explicit_ireland_location(location_text: str) -> bool:
    """Return True only if the location explicitly matches Irish keywords and is not foreign."""
    text = (location_text or "").strip().lower()
    if not text:
        return False
    if re.search(r"\bdublin\s*,\s*(?:oh|ca|va|ga|texas|tx|ohio)\b", text):
        return False
    if any(signal in text for signal in NON_IRELAND_STRONG_SIGNALS):
        return False
    return any(keyword in text for keyword in IRELAND_LOCATION_KEYWORDS)
