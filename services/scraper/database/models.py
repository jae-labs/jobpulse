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


class PublicJobs(BaseModel):
    ai_analysis: Optional[Json[Any]] = Field(alias="ai_analysis")
    company: str = Field(alias="company")
    dedupe_key: str = Field(alias="dedupe_key")
    description: str = Field(alias="description")
    employment_type: str = Field(alias="employment_type")
    first_seen_at: Optional[datetime.datetime] = Field(alias="first_seen_at")
    fit_tier: str = Field(alias="fit_tier")
    id: int = Field(alias="id")
    last_seen_at: Optional[datetime.datetime] = Field(alias="last_seen_at")
    location: str = Field(alias="location")
    matched_skills: Json[Any] = Field(alias="matched_skills")
    relevance: int = Field(alias="relevance")
    role_domain: Optional[str] = Field(alias="role_domain")
    salary_currency: Optional[str] = Field(alias="salary_currency")
    salary_max_amount: Optional[int] = Field(alias="salary_max_amount")
    salary_min_amount: Optional[int] = Field(alias="salary_min_amount")
    salary_period: Optional[str] = Field(alias="salary_period")
    salary_text: Optional[str] = Field(alias="salary_text")
    seniority_level: Optional[str] = Field(alias="seniority_level")
    source: str = Field(alias="source")
    status: str = Field(alias="status")
    title: str = Field(alias="title")
    url: str = Field(alias="url")


class PublicJobsInsert(TypedDict):
    ai_analysis: NotRequired[Annotated[Optional[Json[Any]], Field(alias="ai_analysis")]]
    company: Annotated[str, Field(alias="company")]
    dedupe_key: Annotated[str, Field(alias="dedupe_key")]
    description: Annotated[str, Field(alias="description")]
    employment_type: NotRequired[Annotated[str, Field(alias="employment_type")]]
    first_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="first_seen_at")]]
    fit_tier: NotRequired[Annotated[str, Field(alias="fit_tier")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_seen_at")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    matched_skills: NotRequired[Annotated[Json[Any], Field(alias="matched_skills")]]
    relevance: NotRequired[Annotated[int, Field(alias="relevance")]]
    role_domain: NotRequired[Annotated[Optional[str], Field(alias="role_domain")]]
    salary_currency: NotRequired[Annotated[Optional[str], Field(alias="salary_currency")]]
    salary_max_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_max_amount")]]
    salary_min_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_min_amount")]]
    salary_period: NotRequired[Annotated[Optional[str], Field(alias="salary_period")]]
    salary_text: NotRequired[Annotated[Optional[str], Field(alias="salary_text")]]
    seniority_level: NotRequired[Annotated[Optional[str], Field(alias="seniority_level")]]
    source: Annotated[str, Field(alias="source")]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    title: Annotated[str, Field(alias="title")]
    url: Annotated[str, Field(alias="url")]


class PublicJobsUpdate(TypedDict):
    ai_analysis: NotRequired[Annotated[Optional[Json[Any]], Field(alias="ai_analysis")]]
    company: NotRequired[Annotated[str, Field(alias="company")]]
    dedupe_key: NotRequired[Annotated[str, Field(alias="dedupe_key")]]
    description: NotRequired[Annotated[str, Field(alias="description")]]
    employment_type: NotRequired[Annotated[str, Field(alias="employment_type")]]
    first_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="first_seen_at")]]
    fit_tier: NotRequired[Annotated[str, Field(alias="fit_tier")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_seen_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_seen_at")]]
    location: NotRequired[Annotated[str, Field(alias="location")]]
    matched_skills: NotRequired[Annotated[Json[Any], Field(alias="matched_skills")]]
    relevance: NotRequired[Annotated[int, Field(alias="relevance")]]
    role_domain: NotRequired[Annotated[Optional[str], Field(alias="role_domain")]]
    salary_currency: NotRequired[Annotated[Optional[str], Field(alias="salary_currency")]]
    salary_max_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_max_amount")]]
    salary_min_amount: NotRequired[Annotated[Optional[int], Field(alias="salary_min_amount")]]
    salary_period: NotRequired[Annotated[Optional[str], Field(alias="salary_period")]]
    salary_text: NotRequired[Annotated[Optional[str], Field(alias="salary_text")]]
    seniority_level: NotRequired[Annotated[Optional[str], Field(alias="seniority_level")]]
    source: NotRequired[Annotated[str, Field(alias="source")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    title: NotRequired[Annotated[str, Field(alias="title")]]
    url: NotRequired[Annotated[str, Field(alias="url")]]


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


class PublicEmployers(BaseModel):
    careers_url: str = Field(alias="careers_url")
    discovered_jobs_url: Optional[str] = Field(alias="discovered_jobs_url")
    id: int = Field(alias="id")
    last_scraped_at: Optional[datetime.datetime] = Field(alias="last_scraped_at")
    name: str = Field(alias="name")
    opportunities_found: Optional[int] = Field(alias="opportunities_found")
    priority: int = Field(alias="priority")
    sector: str = Field(alias="sector")
    status: Optional[str] = Field(alias="status")


class PublicEmployersInsert(TypedDict):
    careers_url: Annotated[str, Field(alias="careers_url")]
    discovered_jobs_url: NotRequired[Annotated[Optional[str], Field(alias="discovered_jobs_url")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_scraped_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_scraped_at")]]
    name: Annotated[str, Field(alias="name")]
    opportunities_found: NotRequired[Annotated[Optional[int], Field(alias="opportunities_found")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    sector: Annotated[str, Field(alias="sector")]
    status: NotRequired[Annotated[Optional[str], Field(alias="status")]]


class PublicEmployersUpdate(TypedDict):
    careers_url: NotRequired[Annotated[str, Field(alias="careers_url")]]
    discovered_jobs_url: NotRequired[Annotated[Optional[str], Field(alias="discovered_jobs_url")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    last_scraped_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="last_scraped_at")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    opportunities_found: NotRequired[Annotated[Optional[int], Field(alias="opportunities_found")]]
    priority: NotRequired[Annotated[int, Field(alias="priority")]]
    sector: NotRequired[Annotated[str, Field(alias="sector")]]
    status: NotRequired[Annotated[Optional[str], Field(alias="status")]]


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


class PublicUserJobStatuses(BaseModel):
    id: int = Field(alias="id")
    job_id: int = Field(alias="job_id")
    status: str = Field(alias="status")
    updated_at: Optional[datetime.datetime] = Field(alias="updated_at")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicUserJobStatusesInsert(TypedDict):
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: Annotated[int, Field(alias="job_id")]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    updated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="updated_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicUserJobStatusesUpdate(TypedDict):
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: NotRequired[Annotated[int, Field(alias="job_id")]]
    status: NotRequired[Annotated[str, Field(alias="status")]]
    updated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]


class PublicUserJobEvaluations(BaseModel):
    ai_analysis: Optional[Json[Any]] = Field(alias="ai_analysis")
    calculated_at: Optional[datetime.datetime] = Field(alias="calculated_at")
    fit_tier: str = Field(alias="fit_tier")
    id: int = Field(alias="id")
    job_id: int = Field(alias="job_id")
    matched_skills: Json[Any] = Field(alias="matched_skills")
    relevance: int = Field(alias="relevance")
    user_id: uuid.UUID = Field(alias="user_id")


class PublicUserJobEvaluationsInsert(TypedDict):
    ai_analysis: NotRequired[Annotated[Optional[Json[Any]], Field(alias="ai_analysis")]]
    calculated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="calculated_at")]]
    fit_tier: NotRequired[Annotated[str, Field(alias="fit_tier")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: Annotated[int, Field(alias="job_id")]
    matched_skills: NotRequired[Annotated[Json[Any], Field(alias="matched_skills")]]
    relevance: NotRequired[Annotated[int, Field(alias="relevance")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]


class PublicUserJobEvaluationsUpdate(TypedDict):
    ai_analysis: NotRequired[Annotated[Optional[Json[Any]], Field(alias="ai_analysis")]]
    calculated_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="calculated_at")]]
    fit_tier: NotRequired[Annotated[str, Field(alias="fit_tier")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    job_id: NotRequired[Annotated[int, Field(alias="job_id")]]
    matched_skills: NotRequired[Annotated[Json[Any], Field(alias="matched_skills")]]
    relevance: NotRequired[Annotated[int, Field(alias="relevance")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]
