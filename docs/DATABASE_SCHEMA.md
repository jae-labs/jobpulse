# Database Schema & Migration Management

The JobPulse database is managed via Supabase CLI and version-controlled migrations in `supabase/migrations/`.
All tables and procedures live in the `public` schema with Row-Level Security (RLS) enabled.

## Entity Relationship Diagram

```mermaid
erDiagram
    AUTHORIZED_USERS {
        bigint id PK
        text email UK
        text role
        timestamptz created_at
    }

    JOBS {
        bigint id PK
        text dedupe_key UK
        text title
        text company
        text location
        text employment_type
        text salary_text
        text description
        text url
        text source
        integer relevance
        jsonb matched_skills
        text status
        timestamptz first_seen_at
        timestamptz last_seen_at
        text fit_tier
        text role_domain
        text seniority_level
        jsonb ai_analysis
    }

    USER_PROFILES {
        bigint id PK
        text user_email UK
        text name
        text first_name
        text last_name
        text headline
        text current_role
        text current_company
        text location
        integer minimum_salary
        integer salary_min
        text employment
        text education
        text certifications
        text experience_level
        text summary
        text[] keywords
        text[] target_roles
        text[] target_locations
        text work_mode
        text[] languages
        text[] tools_software
        jsonb scoring_rules
        text avatar_url
        timestamptz updated_at
    }

    USER_JOB_STATUSES {
        bigint id PK
        text user_email
        bigint job_id FK
        text status
        timestamptz updated_at
    }

    USER_JOB_EVALUATIONS {
        bigint id PK
        text user_email
        bigint job_id FK
        integer relevance
        text fit_tier
        jsonb matched_skills
        jsonb ai_analysis
        timestamptz calculated_at
    }

    USER_CVS {
        bigint id PK
        text user_email
        text file_name
        integer file_size
        text mime_type
        text storage_path
        text file_data
        text description
        timestamptz uploaded_at
    }

    USER_COVER_LETTERS {
        bigint id PK
        text user_email
        text file_name
        integer file_size
        text mime_type
        text storage_path
        text file_data
        text description
        timestamptz uploaded_at
    }

    SOURCES {
        bigint id PK
        text name UK
        text url
        text mode
        text last_status
        timestamptz last_synced_at
        text detail
        integer opportunities_found
    }

    JOBS ||--o{ USER_JOB_STATUSES : "has status per user"
    JOBS ||--o{ USER_JOB_EVALUATIONS : "has custom score per user"
```

## Core Tables

| Table Name | Description | Tenant Isolation |
| :--- | :--- | :--- |
| `jobs` | Global catalog of open opportunities | Shared read for authorized users |
| `sources` | Opportunity feed health and sync telemetry | Shared read for authorized users |
| `authorized_users` | Access whitelist and role mapping | Self-lookup only (`email = jwt.email`) |
| `user_profiles` | Candidate career preferences, skills, and resume data | Strictly isolated (`user_email = jwt.email`) |
| `user_job_statuses` | Candidate pipeline stages (`new`, `applied`, etc.) | Strictly isolated (`user_email = jwt.email`) |
| `user_job_evaluations` | Candidate-specific relevance scores and AI reasoning | Strictly isolated (`user_email = jwt.email`) |
| `user_cvs` | Metadata and storage pointers for uploaded resumes | Strictly isolated (`user_email = jwt.email`) |
| `user_cover_letters` | Metadata and storage pointers for cover letters | Strictly isolated (`user_email = jwt.email`) |

## Server-Side Stored Procedures (RPCs)

### 1. `get_overview_metrics(p_user_email TEXT)`

- **Purpose**: Computes funnel status counts, match score distributions, category breakdowns, and top skills
  in a single query run directly on the PostgreSQL server.
- **Security**: Defined with `SECURITY DEFINER`. Enforces `public.is_authorized_user()` and checks that the caller
  JWT email matches `p_user_email`. Unauthenticated access (`anon`) is revoked.

### 2. `get_jobs_page(...)`

- **Purpose**: High-speed paginated query for the opportunities view. Applies search, domain, compensation,
  and match filters at the database level and returns `{ total: number, items: Job[] }`.
- **Security**: Defined with `SECURITY DEFINER`. Validates that caller is authorized and cannot request data
  for other user emails.

## Migration Parity & Type Generation

When modifying schema, follow this strict lifecycle:

```bash
# 1. Create a new migration file
npm run db:migration <migration_name>

# 2. Test locally or push to remote Supabase project
npm run db:push

# 3. Regenerate TypeScript database types
npm run db:types

# 4. Verify code quality gate
npm run check
```

> [!IMPORTANT]
> The database migrations in `supabase/migrations/` must always match the generated types in
> `src/types/database.types.ts`. Never manually edit generated types without applying the corresponding migration.
