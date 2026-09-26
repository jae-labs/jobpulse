# Architecture Overview

JobPulse pairs a React dashboard with a Python ingestion and scoring pipeline
(`services/scraper/`). Both use Supabase.

## System Topology

```mermaid
flowchart TD
    subgraph Frontend ["Frontend Web Application"]
        Client["Browser (React + TanStack Query)"]
    end

    subgraph ScraperService ["Ingestion & Evaluation Service (Python)"]
        Scraper["services/scraper/ (Runner + Extractors)"]
        MetalScorer["engine/scoring.py (Fit Scoring)"]
        Scraper --> MetalScorer
    end

    subgraph Supabase ["Supabase Backend (Single Source of Truth)"]
        Auth["Supabase Auth"]
        PostgREST["PostgREST HTTP API"]
        Storage["Storage Buckets (user-documents, avatars)"]
        DB[("PostgreSQL (RLS Enforced)")]
    end

    Client -->|Authenticate| Auth
    Client -->|Typed RPCs & Queries (Anon JWT)| PostgREST
    PostgREST -->|Execute with caller JWT| DB
    Client -->|Stream Signed URLs / Uploads| Storage
    Storage -->|Access Policies| DB

    Scraper -->|Upsert Opportunities & Evaluations (Service Role)| DB
```

## Core Principles

1. The frontend uses typed Supabase clients and PostgreSQL RPCs.
2. Candidate tables enforce RLS with `user_id = auth.uid()`.
3. Pipeline status changes update optimistically and sync to Supabase.
4. `get_jobs_page` and `get_overview_metrics` handle catalog queries and aggregation.

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
- **Scraper & Ingestion Pipeline (`services/scraper/`)**: Modular Python ETL with 18+ stateless ATS provider adapters, description HTML-to-markdown cleaning, and ML-powered multi-signal candidate fit evaluation (SentenceTransformers on Apple Silicon Metal or CPU).
- **Invitations & Multi-Tenancy**: Invite-only onboarding via cryptographic invite codes and database triggers (`bind_verified_invitation`, `purge_deleted_account_access`).
