# Architecture Overview

JobPulse pairs a React dashboard with a Python vacancy ingestion pipeline
(`services/scraper/`). Browser profile inference and PostgreSQL perform candidate scoring.

## System Topology

```mermaid
flowchart TD
    subgraph Frontend ["Frontend Web Application"]
        Client["Browser (React + TanStack Query)"]
    end

    subgraph ScraperService ["Vacancy Data Provider (Python)"]
        Scraper["services/scraper/ (Runner + Extractors)"]
        JobEmbedder["engine/embeddings.py (Job Vectors)"]
        Scraper --> JobEmbedder
    end

    subgraph Supabase ["Supabase Backend (Single Source of Truth)"]
        Auth["Supabase Auth"]
        PostgREST["PostgREST HTTP API"]
        Storage["Storage Buckets (user-documents, avatars)"]
        DB[("PostgreSQL (RLS Enforced)")]
    end

    Client -->|Authenticate| Auth
    Client -->|Typed RPCs & Queries (Anon JWT)| PostgREST
    Client -->|Profile vector generated in browser| PostgREST
    PostgREST -->|Execute with caller JWT| DB
    Client -->|Stream Signed URLs / Uploads| Storage
    Storage -->|Access Policies| DB

    Scraper -->|Upsert opportunities (Service Role)| DB
    JobEmbedder -->|Upsert job vectors (Service Role)| DB
```

## Core Principles

1. The frontend uses typed Supabase clients and PostgreSQL RPCs.
2. Candidate tables enforce RLS with `user_id = auth.uid()`.
3. Pipeline status changes update optimistically and sync to Supabase.
4. `get_jobs_page` and `get_overview_metrics` join shared vacancy facts with the current user's evaluations for catalog queries and aggregation.
5. `user_job_evaluations` stores candidate sub-scores. The browser generates profile vectors, a private durable PostgreSQL worker scores an exact bounded shortlist, and catalog RPCs compose scores from the current profile weights. Unassessed jobs never inherit another user's score.

## Routes & Views

- `/overview`: Reorderable bento grid with key metrics and lazy-loaded Recharts widgets. Layout order persists in local storage per UID.
- `/opportunities`: Two-pane master-detail pipeline triage with keyboard shortcuts (`↑`/`↓`, `Enter`, `←`/`→`, `f`).
- `/datasources`: Connected source status and crawl health telemetry.
- `/profile`: Candidate preferences, document vault (CVs & cover letters), and scoring weights editor.

## Key Subsystems

- **Design System (`packages/ui/`)**: Internal `@jae-labs/ui` workspace package with product-neutral primitives (`Button`, `Card`, `TextField`, `Select`, `PageHeader`, `Pill`) styled with `--ds-*` visual tokens.
- **Internationalization (`src/lib/i18n.ts`)**: Bilingual support (`en`, `pt-BR`) with automatic language detection and ECMAScript `Intl` formatting.
- **Error Tracking (`src/lib/logger.ts`)**: Decoupled logger routing exceptions from React `ErrorBoundary` and global handlers to Sentry in production.
- **Document Streaming (`src/lib/userProfile.ts`)**: CV and cover letter downloads use short-lived signed URLs with attachment disposition to stream files directly without memory buffering.
- **Scraper & Ingestion Pipeline (`services/scraper/`)**: Modular Python ETL with 18+ stateless ATS provider adapters, description HTML-to-markdown cleaning, and job embeddings generated with SentenceTransformers on Apple Silicon Metal or CPU. Candidate scoring runs in a durable PostgreSQL queue; ingestion advances a catalog generation without candidate fan-out.
- **Invitations & Multi-Tenancy**: Invite-only onboarding via cryptographic invite codes and database triggers (`bind_verified_invitation`, `purge_deleted_account_access`).

Candidate query caches are scoped by immutable Auth user IDs. Profile and document APIs derive ownership from the active session; emails remain contact and invitation fields.
