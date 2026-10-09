"""Typed values at the source, transport and ingestion boundaries."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, replace
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

MAX_WORKER_TASKS = 50_000


class ResponseBudgetExceeded(ValueError):
    """A public response exceeds the configured bounded wire or replay budget."""


@dataclass(frozen=True)
class SourceTarget:
    provider: str
    company: str
    url: str
    identifier: str = ""


@dataclass(frozen=True)
class FetchResponse:
    url: str
    status: int
    body: bytes
    content_type: str = ""
    request: FetchRequest | None = None


@dataclass(frozen=True)
class FetchRequest:
    url: str
    method: Literal["GET", "POST"] = "GET"
    body: bytes | None = None
    headers: tuple[tuple[str, str], ...] = ()


class Transport(Protocol):
    def fetch(self, url: str | FetchRequest, /) -> FetchResponse: ...


class RawJob(BaseModel):
    """Published vacancy facts before common normalization and persistence."""

    model_config = ConfigDict(extra="allow", frozen=True)
    title: str
    company: str
    location: str = ""
    employment_type: str = "See job post"
    description: str = ""
    url: str
    source: str
    external_id: str | None = None
    salary_text: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    def as_record(self) -> dict[str, object]:
        return self.model_dump(exclude_none=True)


class CrawlResult(BaseModel):
    """Health and counts are independent of operator-facing messages."""

    model_config = ConfigDict(frozen=True)
    status: Literal["complete", "incomplete", "blocked", "unsupported"]
    found: int = Field(default=0, ge=0)
    persisted: int = Field(default=0, ge=0)
    failed_writes: int = Field(default=0, ge=0)
    vectors_pending: int = Field(default=0, ge=0)
    pages_requested: int = Field(default=0, ge=0)
    message: str = ""


Parser = Callable[[SourceTarget, FetchResponse], list[RawJob]]


@dataclass(frozen=True)
class SourceAdapter:
    """Composition keeps parsers usable by replay, custom workers and Scrapy."""

    parser: Parser
    request_url: Callable[[SourceTarget], str | FetchRequest]
    next_url: Callable[[SourceTarget, FetchResponse, int], str | FetchRequest | None] | None = None
    max_pages: int = 1
    transport_kind: Literal["http", "browser"] = "http"
    recover: Callable[[SourceTarget, FetchResponse | None, Exception], str | FetchRequest | None] | None = None

    def pages(self, target: SourceTarget, transport: Transport) -> Iterator[tuple[FetchResponse, list[RawJob]]]:
        url = self.request_url(target)
        for page in range(self.max_pages):
            response = None
            try:
                response = transport.fetch(url)
                jobs = self.parser(target, response)
            except Exception as error:
                alternate = self.recover(target, response, error) if self.recover else None
                if alternate is None:
                    raise
                url = alternate
                response = transport.fetch(url)
                jobs = self.parser(target, response)
            if isinstance(url, FetchRequest):
                response = replace(response, request=url)
            yield response, jobs
            following = self.next_url(target, response, page) if self.next_url else None
            if following is None:
                return
            url = following
        raise ValueError("Source listing exceeded its page budget")

    def crawl(self, target: SourceTarget, transport: Transport) -> list[RawJob]:
        return [job for _, jobs in self.pages(target, transport) for job in jobs]


def raw_jobs(records: list[Mapping[str, object]]) -> list[RawJob]:
    return [RawJob.model_validate(record) for record in records]


class SyncReport(tuple[int, str]):
    """Two-value compatibility report with explicit machine-readable source counts."""

    result: CrawlResult

    def __new__(cls, persisted: int, message: str, *, found: int | None = None):
        report = super().__new__(cls, (persisted, message))
        report.result = CrawlResult(
            status="complete", persisted=persisted, found=persisted if found is None else found, message=message
        )
        return report
