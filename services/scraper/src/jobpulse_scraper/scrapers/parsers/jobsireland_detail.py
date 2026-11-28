"""Pure published-detail parsing with vacancy-reference checks."""

import re
from urllib.parse import parse_qs, urlparse

from jobpulse_scraper.engine.text_cleaner import clean_html_description


def parse_jobsireland_detail(url: str, page: str) -> dict[str, str]:
    requested_id = parse_qs(urlparse(url).query).get("id", [""])[0]
    reference = re.search(r'id="JobReference"[^>]*value="\s*#JOB-(\d+)"', page, re.IGNORECASE)
    if reference and reference.group(1) != requested_id:
        return {}
    bodies = re.findall(
        r'<pre\b[^>]*ng-bind-html=["\']Description\s*\|\s*linky["\'][^>]*>(.*?)</pre>',
        page,
        re.IGNORECASE | re.DOTALL,
    )
    if not bodies:
        return {}
    description = clean_html_description("\n".join(bodies))
    if description.lower().strip(" .") in {"n/a", "none", "not available", "no description", "not specified"}:
        description = ""
    return {"description": description, "description_origin": "published_detail"}
