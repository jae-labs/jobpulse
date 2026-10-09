"""Pure posting evidence classification; acquisition failures never imply closure."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from typing import Any, Literal

from pydantic import BaseModel

from jobpulse_scraper.config.rules import ERROR_ANTI_BOT_PATTERNS
from jobpulse_scraper.contracts import FetchResponse
from jobpulse_scraper.engine.description_quality import has_closed_notice, has_description_body
from jobpulse_scraper.engine.html_body import _JobBodyParser
from jobpulse_scraper.engine.normalization import canonical_job_url, posting_url
from jobpulse_scraper.engine.text_cleaner import clean_text as visible_text


class AvailabilityResult(BaseModel):
    state: Literal["active", "closed", "unverified"]
    evidence: Literal[
        "published_detail",
        "explicit_closure",
        "published_expiry",
        "acquisition_failed",
        "identity_unconfirmed",
        "no_posting_evidence",
        "redirected",
        "deadline_exceeded",
    ]


class Probe(BaseModel):
    id: int
    title: str
    url: str


class _StructuredData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.parts: list[str] = []
        self.documents: list[Any] = []

    def handle_starttag(self, tag, attrs):
        self.capture = tag == "script" and dict(attrs).get("type") == "application/ld+json"
        if self.capture:
            self.parts = []

    def handle_data(self, data):
        if self.capture:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.capture:
            if len(self.documents) < 32:
                try:
                    self.documents.append(json.loads("".join(self.parts)))
                except ValueError:
                    pass
            self.capture = False


def _title(value: str) -> str:
    return " ".join(visible_text(value).split()).casefold()


def parse_availability(job: Probe, response: FetchResponse, now: datetime | None = None) -> AvailabilityResult:
    """A redirect, error or unrelated posting is uncertainty, never closure evidence."""

    def unknown(evidence):
        return AvailabilityResult(state="unverified", evidence=evidence)

    if response.status != 200:
        return unknown("redirected" if 300 <= response.status < 400 else "acquisition_failed")
    if canonical_job_url(response.url) != canonical_job_url(job.url):
        return unknown("redirected")
    if "html" not in response.content_type.lower():
        return unknown("no_posting_evidence")
    html = response.body.decode("utf-8", errors="replace")
    text = visible_text(html)
    if any(re.search(pattern, text.lower()) for pattern in ERROR_ANTI_BOT_PATTERNS):
        return unknown("acquisition_failed")
    structured = _StructuredData()
    structured.feed(html)
    queue = list(structured.documents)
    postings: list[dict[str, Any]] = []
    for _ in range(2000):
        if not queue:
            break
        value = queue.pop()
        if isinstance(value, list):
            queue.extend(value[:200])
        elif isinstance(value, dict):
            if value.get("@type") == "JobPosting" or (
                isinstance(value.get("@type"), list) and "JobPosting" in value["@type"]
            ):
                postings.append(value)
            else:
                queue.extend(v for v in value.values() if isinstance(v, (dict, list)))
    matched = [p for p in postings if _title(str(p.get("title") or "")) == _title(job.title)]
    body_parser = _JobBodyParser()
    body_parser.feed(html)
    dedicated = body_parser.dedicated_bodies
    if postings:
        if len(matched) != 1:
            return unknown("identity_unconfirmed")
        posting = matched[0]
        published_url = posting.get("url")
        if published_url and (
            not isinstance(published_url, str) or canonical_job_url(published_url) != canonical_job_url(job.url)
        ):
            return unknown("identity_unconfirmed")
        if not published_url and not posting_url(job.url):
            return unknown("identity_unconfirmed")
        valid_through = posting.get("validThrough")
        if valid_through is not None and not isinstance(valid_through, str):
            return unknown("identity_unconfirmed")
        if isinstance(valid_through, str):
            try:
                expires = datetime.fromisoformat(valid_through.replace("Z", "+00:00"))
                # A date without time closes at the end of its stated day, in UTC.
                if len(valid_through) == 10:
                    expires += timedelta(days=1)
                expires = expires.replace(tzinfo=UTC) if expires.tzinfo is None else expires
                if expires <= (now or datetime.now(UTC)):
                    return AvailabilityResult(state="closed", evidence="published_expiry")
            except ValueError:
                return unknown("identity_unconfirmed")
        description = visible_text(str(posting.get("description") or ""))
        if has_closed_notice(description):
            return AvailabilityResult(state="closed", evidence="explicit_closure")
        if has_closed_notice(text):
            return unknown("identity_unconfirmed")
        return AvailabilityResult(state="active", evidence="published_detail")
    if _title(job.title) not in _title(text) or not posting_url(job.url):
        return unknown("identity_unconfirmed")
    if len(dedicated) == 1 and _title(job.title) in _title(dedicated[0]) and has_closed_notice(dedicated[0]):
        return AvailabilityResult(state="closed", evidence="explicit_closure")
    if has_closed_notice(text):
        return unknown("identity_unconfirmed")
    bodies = dedicated or [body for body in body_parser.bodies if _title(job.title) in _title(body)]
    if (
        len(bodies) == 1
        and has_description_body(bodies[0])
        and re.search(r"responsibilities|requirements|qualifications|duties", bodies[0], re.I)
    ):
        return AvailabilityResult(state="active", evidence="published_detail")
    return unknown("no_posting_evidence")
