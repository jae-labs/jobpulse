from __future__ import annotations

import datetime
import uuid
from typing import (
    Annotated,
    Any,
    List,
    Literal,
    NotRequired,
    Optional,
    TypeAlias,
    TypedDict,
)

from pydantic import BaseModel, Field, Json

RealtimeAction: TypeAlias = Literal["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ERROR"]

RealtimeEqualityOp: TypeAlias = Literal[
    "eq", "neq", "lt", "lte", "gt", "gte", "in", "like", "ilike", "is", "match", "imatch", "isdistinct"
]

StorageBuckettype: TypeAlias = Literal["STANDARD", "ANALYTICS", "VECTOR"]

AuthFactorType: TypeAlias = Literal["totp", "webauthn", "phone"]

AuthFactorStatus: TypeAlias = Literal["unverified", "verified"]

AuthAalLevel: TypeAlias = Literal["aal1", "aal2", "aal3"]

AuthCodeChallengeMethod: TypeAlias = Literal["s256", "plain"]

AuthOneTimeTokenType: TypeAlias = Literal[
    "confirmation_token",
    "reauthentication_token",
    "recovery_token",
    "email_change_token_new",
    "email_change_token_current",
    "phone_change_token",
]

AuthOauthRegistrationType: TypeAlias = Literal["dynamic", "manual"]

AuthOauthAuthorizationStatus: TypeAlias = Literal["pending", "approved", "denied", "expired"]

AuthOauthResponseType: TypeAlias = Literal["code"]

AuthOauthClientType: TypeAlias = Literal["public", "confidential"]


class PublicAuthorizedUsers(BaseModel):
    accepted_at: Optional[datetime.datetime] = Field(alias="accepted_at")
    created_at: Optional[datetime.datetime] = Field(alias="created_at")
    email: str = Field(alias="email")
    id: int = Field(alias="id")
    invite_code: Optional[str] = Field(alias="invite_code")
    invited_by: Optional[uuid.UUID] = Field(alias="invited_by")
    role: str = Field(alias="role")
    status: str = Field(alias="status")
    user_id: Optional[uuid.UUID] = Field(alias="user_id")


class PublicAuthorizedUsersInsert(TypedDict):
    accepted_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="accepted_at")]]
    created_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="created_at")]]
    email: Annotated[str, Field(alias="email")]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    invite_code: NotRequired[Annotated[Optional[str], Field(alias="invite_code")]]
    invited_by: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="invited_by")]]
    role: NotRequired[Annotated[str, Field(alias="role")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    user_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="user_id")]]


class PublicAuthorizedUsersUpdate(TypedDict):
    accepted_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="accepted_at")]]
    created_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="created_at")]]
    email: NotRequired[Annotated[str, Field(alias="email")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    invite_code: NotRequired[Annotated[Optional[str], Field(alias="invite_code")]]
    invited_by: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="invited_by")]]
    role: NotRequired[Annotated[str, Field(alias="role")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    user_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="user_id")]]


class PublicBoards(BaseModel):
    board: str = Field(alias="board")
    careers_url: str = Field(alias="careers_url")
    company: str = Field(alias="company")
    consecutive_failures: int = Field(alias="consecutive_failures")
    cooldown_until: Optional[datetime.datetime] = Field(alias="cooldown_until")
    created_at: datetime.datetime = Field(alias="created_at")
    discovery_source: str = Field(alias="discovery_source")
    employer_id: Optional[int] = Field(alias="employer_id")
    enabled: bool = Field(alias="enabled")
    id: int = Field(alias="id")
    last_crawled_at: Optional[datetime.datetime] = Field(alias="last_crawled_at")
    last_error: Optional[str] = Field(alias="last_error")
    last_ingested_count: int = Field(alias="last_ingested_count")
    last_verified_at: Optional[datetime.datetime] = Field(alias="last_verified_at")
    metadata: Json[Any] = Field(alias="metadata")
    priority: int = Field(alias="priority")
    provider: str = Field(alias="provider")
    region: str = Field(alias="region")
    sector: str = Field(alias="sector")
    status: str = Field(alias="status")
    updated_at: datetime.datetime = Field(alias="updated_at")


class PublicBoardsInsert(TypedDict):
    board: Annotated[str, Field(alias="board")]
    careers_url: Annotated[str, Field(alias="careers_url")]
    company: Annotated[str, Field(alias="company")]
    consecutive_failures: NotRequired[Annotated[int, Field(alias="consecutive_failures")]]
    cooldown_until: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="cooldown_until")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    discovery_source: NotRequired[Annotated[str, Field(alias="discovery_source")]]
    employer_id: NotRequired[Annotated[Optional[int], Field(alias="employer_id")]]
    enabled: NotRequired[Annotated[bool, Field(alias="enabled")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_crawled_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_crawled_at")]]
    last_error: NotRequired[Annotated[Optional[str], Field(alias="last_error")]]
    last_ingested_count: NotRequired[Annotated[int, Field(alias="last_ingested_count")]]
    last_verified_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_verified_at")]]
    metadata: NotRequired[Annotated[Json[Any], Field(alias="metadata")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    provider: Annotated[str, Field(alias="provider")]
    region: NotRequired[Annotated[str, Field(alias="region")]]
    sector: NotRequired[Annotated[str, Field(alias="sector")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]


class PublicBoardsUpdate(TypedDict):
    board: NotRequired[Annotated[str, Field(alias="board")]]
    careers_url: NotRequired[Annotated[str, Field(alias="careers_url")]]
    company: NotRequired[Annotated[str, Field(alias="company")]]
    consecutive_failures: NotRequired[Annotated[int, Field(alias="consecutive_failures")]]
    cooldown_until: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="cooldown_until")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    discovery_source: NotRequired[Annotated[str, Field(alias="discovery_source")]]
    employer_id: NotRequired[Annotated[Optional[int], Field(alias="employer_id")]]
    enabled: NotRequired[Annotated[bool, Field(alias="enabled")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_crawled_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_crawled_at")]]
    last_error: NotRequired[Annotated[Optional[str], Field(alias="last_error")]]
    last_ingested_count: NotRequired[Annotated[int, Field(alias="last_ingested_count")]]
    last_verified_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_verified_at")]]
    metadata: NotRequired[Annotated[Json[Any], Field(alias="metadata")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    provider: NotRequired[Annotated[str, Field(alias="provider")]]
    region: NotRequired[Annotated[str, Field(alias="region")]]
    sector: NotRequired[Annotated[str, Field(alias="sector")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]


class PublicCandidateScoringWork(BaseModel):
    attempts: int = Field(alias="attempts")
    catalog_generation: int = Field(alias="catalog_generation")
    completed_catalog_generation: int = Field(alias="completed_catalog_generation")
    completed_fingerprint: str = Field(alias="completed_fingerprint")
    completed_revision: int = Field(alias="completed_revision")
    cursor: int = Field(alias="cursor")
    desired_revision: int = Field(alias="desired_revision")
    fingerprint: str = Field(alias="fingerprint")
    job_ids: Optional[List[int]] = Field(alias="job_ids")
    last_error_code: Optional[str] = Field(alias="last_error_code")
    needs_embedding: bool = Field(alias="needs_embedding")
    retry_at: datetime.datetime = Field(alias="retry_at")
    shortlist_ids: Optional[List[int]] = Field(alias="shortlist_ids")
    state: str = Field(alias="state")
    top_k: int = Field(alias="top_k")
    updated_at: datetime.datetime = Field(alias="updated_at")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicCandidateScoringWorkInsert(TypedDict):
    attempts: NotRequired[Annotated[int, Field(alias="attempts")]]
    catalog_generation: NotRequired[Annotated[int, Field(alias="catalog_generation")]]
    completed_catalog_generation: NotRequired[Annotated[int, Field(alias="completed_catalog_generation")]]
    completed_fingerprint: NotRequired[Annotated[str, Field(alias="completed_fingerprint")]]
    completed_revision: NotRequired[Annotated[int, Field(alias="completed_revision")]]
    cursor: NotRequired[Annotated[int, Field(alias="cursor")]]
    desired_revision: NotRequired[Annotated[int, Field(alias="desired_revision")]]
    fingerprint: Annotated[str, Field(alias="fingerprint")]
    job_ids: NotRequired[Annotated[Optional[List[int]], Field(alias="job_ids")]]
    last_error_code: NotRequired[Annotated[Optional[str], Field(alias="last_error_code")]]
    needs_embedding: NotRequired[Annotated[bool, Field(alias="needs_embedding")]]
    retry_at: NotRequired[Annotated[datetime.datetime, Field(alias="retry_at")]]
    shortlist_ids: NotRequired[Annotated[Optional[List[int]], Field(alias="shortlist_ids")]]
    state: NotRequired[Annotated[str, Field(alias="state")]]
    top_k: NotRequired[Annotated[int, Field(alias="top_k")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicCandidateScoringWorkUpdate(TypedDict):
    attempts: NotRequired[Annotated[int, Field(alias="attempts")]]
    catalog_generation: NotRequired[Annotated[int, Field(alias="catalog_generation")]]
    completed_catalog_generation: NotRequired[Annotated[int, Field(alias="completed_catalog_generation")]]
    completed_fingerprint: NotRequired[Annotated[str, Field(alias="completed_fingerprint")]]
    completed_revision: NotRequired[Annotated[int, Field(alias="completed_revision")]]
    cursor: NotRequired[Annotated[int, Field(alias="cursor")]]
    desired_revision: NotRequired[Annotated[int, Field(alias="desired_revision")]]
    fingerprint: NotRequired[Annotated[str, Field(alias="fingerprint")]]
    job_ids: NotRequired[Annotated[Optional[List[int]], Field(alias="job_ids")]]
    last_error_code: NotRequired[Annotated[Optional[str], Field(alias="last_error_code")]]
    needs_embedding: NotRequired[Annotated[bool, Field(alias="needs_embedding")]]
    retry_at: NotRequired[Annotated[datetime.datetime, Field(alias="retry_at")]]
    shortlist_ids: NotRequired[Annotated[Optional[List[int]], Field(alias="shortlist_ids")]]
    state: NotRequired[Annotated[str, Field(alias="state")]]
    top_k: NotRequired[Annotated[int, Field(alias="top_k")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicCatalogStats(BaseModel):
    computed_at: datetime.datetime = Field(alias="computed_at")
    id: bool = Field(alias="id")
    is_valid: bool = Field(alias="is_valid")
    job_count: int = Field(alias="job_count")
    locations: Json[Any] = Field(alias="locations")
    sectors: Json[Any] = Field(alias="sectors")


class PublicCatalogStatsInsert(TypedDict):
    computed_at: NotRequired[Annotated[datetime.datetime, Field(alias="computed_at")]]
    id: NotRequired[Annotated[bool, Field(alias="id")]]
    is_valid: NotRequired[Annotated[bool, Field(alias="is_valid")]]
    job_count: NotRequired[Annotated[int, Field(alias="job_count")]]
    locations: NotRequired[Annotated[Json[Any], Field(alias="locations")]]
    sectors: NotRequired[Annotated[Json[Any], Field(alias="sectors")]]


class PublicCatalogStatsUpdate(TypedDict):
    computed_at: NotRequired[Annotated[datetime.datetime, Field(alias="computed_at")]]
    id: NotRequired[Annotated[bool, Field(alias="id")]]
    is_valid: NotRequired[Annotated[bool, Field(alias="is_valid")]]
    job_count: NotRequired[Annotated[int, Field(alias="job_count")]]
    locations: NotRequired[Annotated[Json[Any], Field(alias="locations")]]
    sectors: NotRequired[Annotated[Json[Any], Field(alias="sectors")]]


class PublicCrawlRuns(BaseModel):
    attempt: int = Field(alias="attempt")
    finished_at: Optional[datetime.datetime] = Field(alias="finished_at")
    id: uuid.UUID = Field(alias="id")
    lease_token: uuid.UUID = Field(alias="lease_token")
    result: Json[Any] = Field(alias="result")
    started_at: datetime.datetime = Field(alias="started_at")
    status: str = Field(alias="status")
    task_id: uuid.UUID = Field(alias="task_id")


class PublicCrawlRunsInsert(TypedDict):
    attempt: Annotated[int, Field(alias="attempt")]
    finished_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="finished_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    lease_token: Annotated[uuid.UUID, Field(alias="lease_token")]
    result: NotRequired[Annotated[Json[Any], Field(alias="result")]]
    started_at: NotRequired[Annotated[datetime.datetime, Field(alias="started_at")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    task_id: Annotated[uuid.UUID, Field(alias="task_id")]


class PublicCrawlRunsUpdate(TypedDict):
    attempt: NotRequired[Annotated[int, Field(alias="attempt")]]
    finished_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="finished_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    lease_token: NotRequired[Annotated[uuid.UUID, Field(alias="lease_token")]]
    result: NotRequired[Annotated[Json[Any], Field(alias="result")]]
    started_at: NotRequired[Annotated[datetime.datetime, Field(alias="started_at")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    task_id: NotRequired[Annotated[uuid.UUID, Field(alias="task_id")]]


class PublicCrawlSnapshots(BaseModel):
    body_bytes: int = Field(alias="body_bytes")
    body_key: str = Field(alias="body_key")
    content_hash: str = Field(alias="content_hash")
    fetched_at: datetime.datetime = Field(alias="fetched_at")
    http_status: int = Field(alias="http_status")
    id: uuid.UUID = Field(alias="id")
    parser_version: str = Field(alias="parser_version")
    replay_key: Optional[str] = Field(alias="replay_key")
    run_id: Optional[uuid.UUID] = Field(alias="run_id")
    source_key: str = Field(alias="source_key")
    url: str = Field(alias="url")


class PublicCrawlSnapshotsInsert(TypedDict):
    body_bytes: Annotated[int, Field(alias="body_bytes")]
    body_key: Annotated[str, Field(alias="body_key")]
    content_hash: Annotated[str, Field(alias="content_hash")]
    fetched_at: NotRequired[Annotated[datetime.datetime, Field(alias="fetched_at")]]
    http_status: Annotated[int, Field(alias="http_status")]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    parser_version: Annotated[str, Field(alias="parser_version")]
    replay_key: NotRequired[Annotated[Optional[str], Field(alias="replay_key")]]
    run_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="run_id")]]
    source_key: Annotated[str, Field(alias="source_key")]
    url: Annotated[str, Field(alias="url")]


class PublicCrawlSnapshotsUpdate(TypedDict):
    body_bytes: NotRequired[Annotated[int, Field(alias="body_bytes")]]
    body_key: NotRequired[Annotated[str, Field(alias="body_key")]]
    content_hash: NotRequired[Annotated[str, Field(alias="content_hash")]]
    fetched_at: NotRequired[Annotated[datetime.datetime, Field(alias="fetched_at")]]
    http_status: NotRequired[Annotated[int, Field(alias="http_status")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    parser_version: NotRequired[Annotated[str, Field(alias="parser_version")]]
    replay_key: NotRequired[Annotated[Optional[str], Field(alias="replay_key")]]
    run_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="run_id")]]
    source_key: NotRequired[Annotated[str, Field(alias="source_key")]]
    url: NotRequired[Annotated[str, Field(alias="url")]]


class PublicCrawlTasks(BaseModel):
    attempt: int = Field(alias="attempt")
    created_at: datetime.datetime = Field(alias="created_at")
    id: uuid.UUID = Field(alias="id")
    last_succeeded_at: Optional[datetime.datetime] = Field(alias="last_succeeded_at")
    lease_token: Optional[uuid.UUID] = Field(alias="lease_token")
    lease_until: Optional[datetime.datetime] = Field(alias="lease_until")
    max_attempts: int = Field(alias="max_attempts")
    next_fetch_at: datetime.datetime = Field(alias="next_fetch_at")
    priority: int = Field(alias="priority")
    source_key: str = Field(alias="source_key")
    status: str = Field(alias="status")
    target: Json[Any] = Field(alias="target")
    updated_at: datetime.datetime = Field(alias="updated_at")


class PublicCrawlTasksInsert(TypedDict):
    attempt: NotRequired[Annotated[int, Field(alias="attempt")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    last_succeeded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_succeeded_at")]]
    lease_token: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="lease_token")]]
    lease_until: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="lease_until")]]
    max_attempts: NotRequired[Annotated[int, Field(alias="max_attempts")]]
    next_fetch_at: NotRequired[Annotated[datetime.datetime, Field(alias="next_fetch_at")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    source_key: Annotated[str, Field(alias="source_key")]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    target: Annotated[Json[Any], Field(alias="target")]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]


class PublicCrawlTasksUpdate(TypedDict):
    attempt: NotRequired[Annotated[int, Field(alias="attempt")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    last_succeeded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_succeeded_at")]]
    lease_token: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="lease_token")]]
    lease_until: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="lease_until")]]
    max_attempts: NotRequired[Annotated[int, Field(alias="max_attempts")]]
    next_fetch_at: NotRequired[Annotated[datetime.datetime, Field(alias="next_fetch_at")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    source_key: NotRequired[Annotated[str, Field(alias="source_key")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    target: NotRequired[Annotated[Json[Any], Field(alias="target")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]


class PublicEmployerOfficeLookups(BaseModel):
    checked_at: datetime.datetime = Field(alias="checked_at")
    employer_id: int = Field(alias="employer_id")
    employer_name: str = Field(alias="employer_name")
    location: str = Field(alias="location")
    office_place_ids: Json[Any] = Field(alias="office_place_ids")
    retry_after: datetime.datetime = Field(alias="retry_after")
    status: str = Field(alias="status")


class PublicEmployerOfficeLookupsInsert(TypedDict):
    checked_at: NotRequired[Annotated[datetime.datetime, Field(alias="checked_at")]]
    employer_id: Annotated[int, Field(alias="employer_id")]
    employer_name: Annotated[str, Field(alias="employer_name")]
    location: Annotated[str, Field(alias="location")]
    office_place_ids: NotRequired[Annotated[Json[Any], Field(alias="office_place_ids")]]
    retry_after: Annotated[datetime.datetime, Field(alias="retry_after")]
    status: Annotated[str, Field(alias="status")]


class PublicEmployerOfficeLookupsUpdate(TypedDict):
    checked_at: NotRequired[Annotated[datetime.datetime, Field(alias="checked_at")]]
    employer_id: NotRequired[Annotated[int, Field(alias="employer_id")]]
    employer_name: NotRequired[Annotated[str, Field(alias="employer_name")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    office_place_ids: NotRequired[Annotated[Json[Any], Field(alias="office_place_ids")]]
    retry_after: NotRequired[Annotated[datetime.datetime, Field(alias="retry_after")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]


class PublicEmployerOffices(BaseModel):
    address: str = Field(alias="address")
    categories: Json[Any] = Field(alias="categories")
    checked_at: datetime.datetime = Field(alias="checked_at")
    city: Optional[str] = Field(alias="city")
    country_code: Optional[str] = Field(alias="country_code")
    employer_id: int = Field(alias="employer_id")
    latitude: float = Field(alias="latitude")
    longitude: float = Field(alias="longitude")
    name: str = Field(alias="name")
    place_id: str = Field(alias="place_id")
    source: str = Field(alias="source")
    website: Optional[str] = Field(alias="website")
    website_domain: Optional[str] = Field(alias="website_domain")


class PublicEmployerOfficesInsert(TypedDict):
    address: Annotated[str, Field(alias="address")]
    categories: NotRequired[Annotated[Json[Any], Field(alias="categories")]]
    checked_at: NotRequired[Annotated[datetime.datetime, Field(alias="checked_at")]]
    city: NotRequired[Annotated[Optional[str], Field(alias="city")]]
    country_code: NotRequired[Annotated[Optional[str], Field(alias="country_code")]]
    employer_id: Annotated[int, Field(alias="employer_id")]
    latitude: Annotated[float, Field(alias="latitude")]
    longitude: Annotated[float, Field(alias="longitude")]
    name: Annotated[str, Field(alias="name")]
    place_id: Annotated[str, Field(alias="place_id")]
    source: NotRequired[Annotated[str, Field(alias="source")]]
    website: NotRequired[Annotated[Optional[str], Field(alias="website")]]
    website_domain: NotRequired[Annotated[Optional[str], Field(alias="website_domain")]]


class PublicEmployerOfficesUpdate(TypedDict):
    address: NotRequired[Annotated[str, Field(alias="address")]]
    categories: NotRequired[Annotated[Json[Any], Field(alias="categories")]]
    checked_at: NotRequired[Annotated[datetime.datetime, Field(alias="checked_at")]]
    city: NotRequired[Annotated[Optional[str], Field(alias="city")]]
    country_code: NotRequired[Annotated[Optional[str], Field(alias="country_code")]]
    employer_id: NotRequired[Annotated[int, Field(alias="employer_id")]]
    latitude: NotRequired[Annotated[float, Field(alias="latitude")]]
    longitude: NotRequired[Annotated[float, Field(alias="longitude")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    place_id: NotRequired[Annotated[str, Field(alias="place_id")]]
    source: NotRequired[Annotated[str, Field(alias="source")]]
    website: NotRequired[Annotated[Optional[str], Field(alias="website")]]
    website_domain: NotRequired[Annotated[Optional[str], Field(alias="website_domain")]]


class PublicEmployers(BaseModel):
    careers_url: str = Field(alias="careers_url")
    description: Optional[str] = Field(alias="description")
    discovered_jobs_url: Optional[str] = Field(alias="discovered_jobs_url")
    enriched_at: Optional[datetime.datetime] = Field(alias="enriched_at")
    id: int = Field(alias="id")
    last_scraped_at: Optional[datetime.datetime] = Field(alias="last_scraped_at")
    latitude: Optional[float] = Field(alias="latitude")
    location: Optional[str] = Field(alias="location")
    longitude: Optional[float] = Field(alias="longitude")
    metadata_source: str = Field(alias="metadata_source")
    name: str = Field(alias="name")
    opportunities_found: Optional[int] = Field(alias="opportunities_found")
    priority: int = Field(alias="priority")
    sector: str = Field(alias="sector")
    size: Optional[str] = Field(alias="size")
    status: Optional[str] = Field(alias="status")
    website: Optional[str] = Field(alias="website")


class PublicEmployersInsert(TypedDict):
    careers_url: Annotated[str, Field(alias="careers_url")]
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    discovered_jobs_url: NotRequired[Annotated[Optional[str], Field(alias="discovered_jobs_url")]]
    enriched_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="enriched_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_scraped_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_scraped_at")]]
    latitude: NotRequired[Annotated[Optional[float], Field(alias="latitude")]]
    location: NotRequired[Annotated[Optional[str], Field(alias="location")]]
    longitude: NotRequired[Annotated[Optional[float], Field(alias="longitude")]]
    metadata_source: NotRequired[Annotated[str, Field(alias="metadata_source")]]
    name: Annotated[str, Field(alias="name")]
    opportunities_found: NotRequired[Annotated[Optional[int], Field(alias="opportunities_found")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    sector: Annotated[str, Field(alias="sector")]
    size: NotRequired[Annotated[Optional[str], Field(alias="size")]]
    status: NotRequired[Annotated[Optional[str], Field(alias="status")]]
    website: NotRequired[Annotated[Optional[str], Field(alias="website")]]


class PublicEmployersUpdate(TypedDict):
    careers_url: NotRequired[Annotated[str, Field(alias="careers_url")]]
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    discovered_jobs_url: NotRequired[Annotated[Optional[str], Field(alias="discovered_jobs_url")]]
    enriched_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="enriched_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_scraped_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_scraped_at")]]
    latitude: NotRequired[Annotated[Optional[float], Field(alias="latitude")]]
    location: NotRequired[Annotated[Optional[str], Field(alias="location")]]
    longitude: NotRequired[Annotated[Optional[float], Field(alias="longitude")]]
    metadata_source: NotRequired[Annotated[str, Field(alias="metadata_source")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    opportunities_found: NotRequired[Annotated[Optional[int], Field(alias="opportunities_found")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    sector: NotRequired[Annotated[str, Field(alias="sector")]]
    size: NotRequired[Annotated[Optional[str], Field(alias="size")]]
    status: NotRequired[Annotated[Optional[str], Field(alias="status")]]
    website: NotRequired[Annotated[Optional[str], Field(alias="website")]]


class PublicJobOccurrences(BaseModel):
    content_hash: str = Field(alias="content_hash")
    external_id: str = Field(alias="external_id")
    first_seen_at: datetime.datetime = Field(alias="first_seen_at")
    id: int = Field(alias="id")
    job_id: int = Field(alias="job_id")
    last_seen_at: datetime.datetime = Field(alias="last_seen_at")
    snapshot_id: Optional[uuid.UUID] = Field(alias="snapshot_id")
    source_key: str = Field(alias="source_key")
    source_url: str = Field(alias="source_url")


class PublicJobOccurrencesInsert(TypedDict):
    content_hash: Annotated[str, Field(alias="content_hash")]
    external_id: Annotated[str, Field(alias="external_id")]
    first_seen_at: NotRequired[Annotated[datetime.datetime, Field(alias="first_seen_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: Annotated[int, Field(alias="job_id")]
    last_seen_at: NotRequired[Annotated[datetime.datetime, Field(alias="last_seen_at")]]
    snapshot_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="snapshot_id")]]
    source_key: Annotated[str, Field(alias="source_key")]
    source_url: Annotated[str, Field(alias="source_url")]


class PublicJobOccurrencesUpdate(TypedDict):
    content_hash: NotRequired[Annotated[str, Field(alias="content_hash")]]
    external_id: NotRequired[Annotated[str, Field(alias="external_id")]]
    first_seen_at: NotRequired[Annotated[datetime.datetime, Field(alias="first_seen_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: NotRequired[Annotated[int, Field(alias="job_id")]]
    last_seen_at: NotRequired[Annotated[datetime.datetime, Field(alias="last_seen_at")]]
    snapshot_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="snapshot_id")]]
    source_key: NotRequired[Annotated[str, Field(alias="source_key")]]
    source_url: NotRequired[Annotated[str, Field(alias="source_url")]]


class PublicJobScoringEmbeddings(BaseModel):
    content_hash: str = Field(alias="content_hash")
    embedding: list[Any] = Field(alias="embedding")
    job_id: int = Field(alias="job_id")
    model_version: str = Field(alias="model_version")


class PublicJobScoringEmbeddingsInsert(TypedDict):
    content_hash: Annotated[str, Field(alias="content_hash")]
    embedding: Annotated[list[Any], Field(alias="embedding")]
    job_id: Annotated[int, Field(alias="job_id")]
    model_version: Annotated[str, Field(alias="model_version")]


class PublicJobScoringEmbeddingsUpdate(TypedDict):
    content_hash: NotRequired[Annotated[str, Field(alias="content_hash")]]
    embedding: NotRequired[Annotated[list[Any], Field(alias="embedding")]]
    job_id: NotRequired[Annotated[int, Field(alias="job_id")]]
    model_version: NotRequired[Annotated[str, Field(alias="model_version")]]


class PublicJobs(BaseModel):
    availability_checked_at: Optional[datetime.datetime] = Field(alias="availability_checked_at")
    availability_evidence: Optional[str] = Field(alias="availability_evidence")
    availability_status: str = Field(alias="availability_status")
    closed_at: Optional[datetime.datetime] = Field(alias="closed_at")
    closed_reason: Optional[str] = Field(alias="closed_reason")
    company: str = Field(alias="company")
    coordinate_source: Optional[str] = Field(alias="coordinate_source")
    dedupe_key: str = Field(alias="dedupe_key")
    description: str = Field(alias="description")
    employer_id: Optional[int] = Field(alias="employer_id")
    employment_type: str = Field(alias="employment_type")
    first_seen_at: Optional[datetime.datetime] = Field(alias="first_seen_at")
    id: int = Field(alias="id")
    last_seen_at: Optional[datetime.datetime] = Field(alias="last_seen_at")
    latitude: Optional[float] = Field(alias="latitude")
    location: str = Field(alias="location")
    location_verification: Optional[Json[Any]] = Field(alias="location_verification")
    longitude: Optional[float] = Field(alias="longitude")
    salary_currency: Optional[str] = Field(alias="salary_currency")
    salary_max_amount: Optional[int] = Field(alias="salary_max_amount")
    salary_min_amount: Optional[int] = Field(alias="salary_min_amount")
    salary_period: Optional[str] = Field(alias="salary_period")
    salary_text: Optional[str] = Field(alias="salary_text")
    source: str = Field(alias="source")
    title: str = Field(alias="title")
    url: str = Field(alias="url")


class PublicJobsInsert(TypedDict):
    availability_checked_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="availability_checked_at")]]
    availability_evidence: NotRequired[Annotated[Optional[str], Field(alias="availability_evidence")]]
    availability_status: NotRequired[Annotated[str, Field(alias="availability_status")]]
    closed_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="closed_at")]]
    closed_reason: NotRequired[Annotated[Optional[str], Field(alias="closed_reason")]]
    company: Annotated[str, Field(alias="company")]
    coordinate_source: NotRequired[Annotated[Optional[str], Field(alias="coordinate_source")]]
    dedupe_key: Annotated[str, Field(alias="dedupe_key")]
    description: Annotated[str, Field(alias="description")]
    employer_id: NotRequired[Annotated[Optional[int], Field(alias="employer_id")]]
    employment_type: NotRequired[Annotated[str, Field(alias="employment_type")]]
    first_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="first_seen_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_seen_at")]]
    latitude: NotRequired[Annotated[Optional[float], Field(alias="latitude")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    location_verification: NotRequired[Annotated[Optional[Json[Any]], Field(alias="location_verification")]]
    longitude: NotRequired[Annotated[Optional[float], Field(alias="longitude")]]
    salary_currency: NotRequired[Annotated[Optional[str], Field(alias="salary_currency")]]
    salary_max_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_max_amount")]]
    salary_min_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_min_amount")]]
    salary_period: NotRequired[Annotated[Optional[str], Field(alias="salary_period")]]
    salary_text: NotRequired[Annotated[Optional[str], Field(alias="salary_text")]]
    source: Annotated[str, Field(alias="source")]
    title: Annotated[str, Field(alias="title")]
    url: Annotated[str, Field(alias="url")]


class PublicJobsUpdate(TypedDict):
    availability_checked_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="availability_checked_at")]]
    availability_evidence: NotRequired[Annotated[Optional[str], Field(alias="availability_evidence")]]
    availability_status: NotRequired[Annotated[str, Field(alias="availability_status")]]
    closed_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="closed_at")]]
    closed_reason: NotRequired[Annotated[Optional[str], Field(alias="closed_reason")]]
    company: NotRequired[Annotated[str, Field(alias="company")]]
    coordinate_source: NotRequired[Annotated[Optional[str], Field(alias="coordinate_source")]]
    dedupe_key: NotRequired[Annotated[str, Field(alias="dedupe_key")]]
    description: NotRequired[Annotated[str, Field(alias="description")]]
    employer_id: NotRequired[Annotated[Optional[int], Field(alias="employer_id")]]
    employment_type: NotRequired[Annotated[str, Field(alias="employment_type")]]
    first_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="first_seen_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_seen_at")]]
    latitude: NotRequired[Annotated[Optional[float], Field(alias="latitude")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    location_verification: NotRequired[Annotated[Optional[Json[Any]], Field(alias="location_verification")]]
    longitude: NotRequired[Annotated[Optional[float], Field(alias="longitude")]]
    salary_currency: NotRequired[Annotated[Optional[str], Field(alias="salary_currency")]]
    salary_max_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_max_amount")]]
    salary_min_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_min_amount")]]
    salary_period: NotRequired[Annotated[Optional[str], Field(alias="salary_period")]]
    salary_text: NotRequired[Annotated[Optional[str], Field(alias="salary_text")]]
    source: NotRequired[Annotated[str, Field(alias="source")]]
    title: NotRequired[Annotated[str, Field(alias="title")]]
    url: NotRequired[Annotated[str, Field(alias="url")]]


class PublicProfileScoringEmbeddings(BaseModel):
    content_hash: str = Field(alias="content_hash")
    embedding: list[Any] = Field(alias="embedding")
    model_version: str = Field(alias="model_version")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicProfileScoringEmbeddingsInsert(TypedDict):
    content_hash: Annotated[str, Field(alias="content_hash")]
    embedding: Annotated[list[Any], Field(alias="embedding")]
    model_version: Annotated[str, Field(alias="model_version")]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicProfileScoringEmbeddingsUpdate(TypedDict):
    content_hash: NotRequired[Annotated[str, Field(alias="content_hash")]]
    embedding: NotRequired[Annotated[list[Any], Field(alias="embedding")]]
    model_version: NotRequired[Annotated[str, Field(alias="model_version")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicScoringCatalogGeneration(BaseModel):
    generation: int = Field(alias="generation")
    id: bool = Field(alias="id")


class PublicScoringCatalogGenerationInsert(TypedDict):
    generation: NotRequired[Annotated[int, Field(alias="generation")]]
    id: NotRequired[Annotated[bool, Field(alias="id")]]


class PublicScoringCatalogGenerationUpdate(TypedDict):
    generation: NotRequired[Annotated[int, Field(alias="generation")]]
    id: NotRequired[Annotated[bool, Field(alias="id")]]


class PublicSources(BaseModel):
    detail: Optional[str] = Field(alias="detail")
    id: int = Field(alias="id")
    last_status: str = Field(alias="last_status")
    last_synced_at: Optional[datetime.datetime] = Field(alias="last_synced_at")
    mode: str = Field(alias="mode")
    name: str = Field(alias="name")
    opportunities_found: Optional[int] = Field(alias="opportunities_found")
    url: str = Field(alias="url")


class PublicSourcesInsert(TypedDict):
    detail: NotRequired[Annotated[Optional[str], Field(alias="detail")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_status: NotRequired[Annotated[str, Field(alias="last_status")]]
    last_synced_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_synced_at")]]
    mode: NotRequired[Annotated[str, Field(alias="mode")]]
    name: Annotated[str, Field(alias="name")]
    opportunities_found: NotRequired[Annotated[Optional[int], Field(alias="opportunities_found")]]
    url: Annotated[str, Field(alias="url")]


class PublicSourcesUpdate(TypedDict):
    detail: NotRequired[Annotated[Optional[str], Field(alias="detail")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_status: NotRequired[Annotated[str, Field(alias="last_status")]]
    last_synced_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_synced_at")]]
    mode: NotRequired[Annotated[str, Field(alias="mode")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    opportunities_found: NotRequired[Annotated[Optional[int], Field(alias="opportunities_found")]]
    url: NotRequired[Annotated[str, Field(alias="url")]]


class PublicUserCoverLetters(BaseModel):
    description: Optional[str] = Field(alias="description")
    file_name: str = Field(alias="file_name")
    file_size: int = Field(alias="file_size")
    id: int = Field(alias="id")
    mime_type: str = Field(alias="mime_type")
    storage_path: Optional[str] = Field(alias="storage_path")
    uploaded_at: Optional[datetime.datetime] = Field(alias="uploaded_at")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicUserCoverLettersInsert(TypedDict):
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    file_name: Annotated[str, Field(alias="file_name")]
    file_size: NotRequired[Annotated[int, Field(alias="file_size")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    mime_type: NotRequired[Annotated[str, Field(alias="mime_type")]]
    storage_path: NotRequired[Annotated[Optional[str], Field(alias="storage_path")]]
    uploaded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="uploaded_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicUserCoverLettersUpdate(TypedDict):
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    file_name: NotRequired[Annotated[str, Field(alias="file_name")]]
    file_size: NotRequired[Annotated[int, Field(alias="file_size")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    mime_type: NotRequired[Annotated[str, Field(alias="mime_type")]]
    storage_path: NotRequired[Annotated[Optional[str], Field(alias="storage_path")]]
    uploaded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="uploaded_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicUserCvs(BaseModel):
    description: Optional[str] = Field(alias="description")
    file_name: str = Field(alias="file_name")
    file_size: int = Field(alias="file_size")
    id: int = Field(alias="id")
    mime_type: str = Field(alias="mime_type")
    storage_path: Optional[str] = Field(alias="storage_path")
    uploaded_at: Optional[datetime.datetime] = Field(alias="uploaded_at")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicUserCvsInsert(TypedDict):
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    file_name: Annotated[str, Field(alias="file_name")]
    file_size: NotRequired[Annotated[int, Field(alias="file_size")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    mime_type: NotRequired[Annotated[str, Field(alias="mime_type")]]
    storage_path: NotRequired[Annotated[Optional[str], Field(alias="storage_path")]]
    uploaded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="uploaded_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicUserCvsUpdate(TypedDict):
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    file_name: NotRequired[Annotated[str, Field(alias="file_name")]]
    file_size: NotRequired[Annotated[int, Field(alias="file_size")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    mime_type: NotRequired[Annotated[str, Field(alias="mime_type")]]
    storage_path: NotRequired[Annotated[Optional[str], Field(alias="storage_path")]]
    uploaded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="uploaded_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicUserJobEvaluations(BaseModel):
    ai_analysis: Optional[Json[Any]] = Field(alias="ai_analysis")
    calculated_at: Optional[datetime.datetime] = Field(alias="calculated_at")
    fit_tier: str = Field(alias="fit_tier")
    id: int = Field(alias="id")
    job_id: int = Field(alias="job_id")
    matched_skills: Json[Any] = Field(alias="matched_skills")
    relevance: int = Field(alias="relevance")
    scoring_job_hash: Optional[str] = Field(alias="scoring_job_hash")
    scoring_profile_hash: Optional[str] = Field(alias="scoring_profile_hash")
    scoring_version: Optional[str] = Field(alias="scoring_version")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicUserJobEvaluationsInsert(TypedDict):
    ai_analysis: NotRequired[Annotated[Optional[Json[Any]], Field(alias="ai_analysis")]]
    calculated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="calculated_at")]]
    fit_tier: NotRequired[Annotated[str, Field(alias="fit_tier")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: Annotated[int, Field(alias="job_id")]
    matched_skills: NotRequired[Annotated[Json[Any], Field(alias="matched_skills")]]
    relevance: NotRequired[Annotated[int, Field(alias="relevance")]]
    scoring_job_hash: NotRequired[Annotated[Optional[str], Field(alias="scoring_job_hash")]]
    scoring_profile_hash: NotRequired[Annotated[Optional[str], Field(alias="scoring_profile_hash")]]
    scoring_version: NotRequired[Annotated[Optional[str], Field(alias="scoring_version")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicUserJobEvaluationsUpdate(TypedDict):
    ai_analysis: NotRequired[Annotated[Optional[Json[Any]], Field(alias="ai_analysis")]]
    calculated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="calculated_at")]]
    fit_tier: NotRequired[Annotated[str, Field(alias="fit_tier")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: NotRequired[Annotated[int, Field(alias="job_id")]]
    matched_skills: NotRequired[Annotated[Json[Any], Field(alias="matched_skills")]]
    relevance: NotRequired[Annotated[int, Field(alias="relevance")]]
    scoring_job_hash: NotRequired[Annotated[Optional[str], Field(alias="scoring_job_hash")]]
    scoring_profile_hash: NotRequired[Annotated[Optional[str], Field(alias="scoring_profile_hash")]]
    scoring_version: NotRequired[Annotated[Optional[str], Field(alias="scoring_version")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicUserJobStatuses(BaseModel):
    id: int = Field(alias="id")
    is_saved: bool = Field(alias="is_saved")
    job_id: int = Field(alias="job_id")
    status: str = Field(alias="status")
    updated_at: Optional[datetime.datetime] = Field(alias="updated_at")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicUserJobStatusesInsert(TypedDict):
    id: NotRequired[Annotated[int, Field(alias="id")]]
    is_saved: NotRequired[Annotated[bool, Field(alias="is_saved")]]
    job_id: Annotated[int, Field(alias="job_id")]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    updated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="updated_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicUserJobStatusesUpdate(TypedDict):
    id: NotRequired[Annotated[int, Field(alias="id")]]
    is_saved: NotRequired[Annotated[bool, Field(alias="is_saved")]]
    job_id: NotRequired[Annotated[int, Field(alias="job_id")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    updated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicUserProfiles(BaseModel):
    avatar_url: Optional[str] = Field(alias="avatar_url")
    certifications: Optional[str] = Field(alias="certifications")
    created_at: Optional[datetime.datetime] = Field(alias="created_at")
    current_company: Optional[str] = Field(alias="current_company")
    current_role: str = Field(alias="current_role")
    education: str = Field(alias="education")
    employment: str = Field(alias="employment")
    experience_level: Optional[str] = Field(alias="experience_level")
    first_name: Optional[str] = Field(alias="first_name")
    gender: Optional[str] = Field(alias="gender")
    headline: str = Field(alias="headline")
    id: int = Field(alias="id")
    keywords: Optional[List[str]] = Field(alias="keywords")
    languages: Optional[List[str]] = Field(alias="languages")
    last_name: Optional[str] = Field(alias="last_name")
    linkedin_url: Optional[str] = Field(alias="linkedin_url")
    location: str = Field(alias="location")
    name: str = Field(alias="name")
    phone: Optional[str] = Field(alias="phone")
    salary_min: int = Field(alias="salary_min")
    scoring_rules: Optional[Json[Any]] = Field(alias="scoring_rules")
    summary: str = Field(alias="summary")
    target_locations: Optional[List[str]] = Field(alias="target_locations")
    target_roles: Optional[List[str]] = Field(alias="target_roles")
    tools_software: Optional[List[str]] = Field(alias="tools_software")
    updated_at: Optional[datetime.datetime] = Field(alias="updated_at")
    user_id: uuid.UUID = Field(alias="user_id")
    work_authorization: Optional[str] = Field(alias="work_authorization")
    work_mode: Optional[str] = Field(alias="work_mode")


class PublicUserProfilesInsert(TypedDict):
    avatar_url: NotRequired[Annotated[Optional[str], Field(alias="avatar_url")]]
    certifications: NotRequired[Annotated[Optional[str], Field(alias="certifications")]]
    created_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="created_at")]]
    current_company: NotRequired[Annotated[Optional[str], Field(alias="current_company")]]
    current_role: NotRequired[Annotated[str, Field(alias="current_role")]]
    education: NotRequired[Annotated[str, Field(alias="education")]]
    employment: NotRequired[Annotated[str, Field(alias="employment")]]
    experience_level: NotRequired[Annotated[Optional[str], Field(alias="experience_level")]]
    first_name: NotRequired[Annotated[Optional[str], Field(alias="first_name")]]
    gender: NotRequired[Annotated[Optional[str], Field(alias="gender")]]
    headline: NotRequired[Annotated[str, Field(alias="headline")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    keywords: NotRequired[Annotated[Optional[List[str]], Field(alias="keywords")]]
    languages: NotRequired[Annotated[Optional[List[str]], Field(alias="languages")]]
    last_name: NotRequired[Annotated[Optional[str], Field(alias="last_name")]]
    linkedin_url: NotRequired[Annotated[Optional[str], Field(alias="linkedin_url")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    phone: NotRequired[Annotated[Optional[str], Field(alias="phone")]]
    salary_min: NotRequired[Annotated[int, Field(alias="salary_min")]]
    scoring_rules: NotRequired[Annotated[Optional[Json[Any]], Field(alias="scoring_rules")]]
    summary: NotRequired[Annotated[str, Field(alias="summary")]]
    target_locations: NotRequired[Annotated[Optional[List[str]], Field(alias="target_locations")]]
    target_roles: NotRequired[Annotated[Optional[List[str]], Field(alias="target_roles")]]
    tools_software: NotRequired[Annotated[Optional[List[str]], Field(alias="tools_software")]]
    updated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="updated_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]
    work_authorization: NotRequired[Annotated[Optional[str], Field(alias="work_authorization")]]
    work_mode: NotRequired[Annotated[Optional[str], Field(alias="work_mode")]]


class PublicUserProfilesUpdate(TypedDict):
    avatar_url: NotRequired[Annotated[Optional[str], Field(alias="avatar_url")]]
    certifications: NotRequired[Annotated[Optional[str], Field(alias="certifications")]]
    created_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="created_at")]]
    current_company: NotRequired[Annotated[Optional[str], Field(alias="current_company")]]
    current_role: NotRequired[Annotated[str, Field(alias="current_role")]]
    education: NotRequired[Annotated[str, Field(alias="education")]]
    employment: NotRequired[Annotated[str, Field(alias="employment")]]
    experience_level: NotRequired[Annotated[Optional[str], Field(alias="experience_level")]]
    first_name: NotRequired[Annotated[Optional[str], Field(alias="first_name")]]
    gender: NotRequired[Annotated[Optional[str], Field(alias="gender")]]
    headline: NotRequired[Annotated[str, Field(alias="headline")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    keywords: NotRequired[Annotated[Optional[List[str]], Field(alias="keywords")]]
    languages: NotRequired[Annotated[Optional[List[str]], Field(alias="languages")]]
    last_name: NotRequired[Annotated[Optional[str], Field(alias="last_name")]]
    linkedin_url: NotRequired[Annotated[Optional[str], Field(alias="linkedin_url")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    phone: NotRequired[Annotated[Optional[str], Field(alias="phone")]]
    salary_min: NotRequired[Annotated[int, Field(alias="salary_min")]]
    scoring_rules: NotRequired[Annotated[Optional[Json[Any]], Field(alias="scoring_rules")]]
    summary: NotRequired[Annotated[str, Field(alias="summary")]]
    target_locations: NotRequired[Annotated[Optional[List[str]], Field(alias="target_locations")]]
    target_roles: NotRequired[Annotated[Optional[List[str]], Field(alias="target_roles")]]
    tools_software: NotRequired[Annotated[Optional[List[str]], Field(alias="tools_software")]]
    updated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]
    work_authorization: NotRequired[Annotated[Optional[str], Field(alias="work_authorization")]]
    work_mode: NotRequired[Annotated[Optional[str], Field(alias="work_mode")]]
