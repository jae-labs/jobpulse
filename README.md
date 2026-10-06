<p align="center">
  <img src="public/favicon.svg" alt="JobPulse" width="72" />
</p>

<h1 align="center">JobPulse</h1>

<p align="center">Discover, score, and track Irish jobs in one candidate-focused dashboard.</p>

<p align="center">
  <a href="https://github.com/jae-labs/jobpulse/actions/workflows/ci.yml"><img src="https://github.com/jae-labs/jobpulse/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/jae-labs/jobpulse/issues"><img src="https://img.shields.io/github/issues/jae-labs/jobpulse" alt="Open issues" /></a>
  <a href="https://github.com/jae-labs/jobpulse/stargazers"><img src="https://img.shields.io/github/stars/jae-labs/jobpulse" alt="Stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/jae-labs/jobpulse" alt="License" /></a>
  <a href="https://jobpulse.justanother.engineer"><img src="https://img.shields.io/badge/site-live-267D62" alt="Live site" /></a>
</p>

JobPulse combines a React dashboard, a Python scraper, and Supabase. It collects Irish vacancies, calculates a separate match score for each candidate, and tracks each person's application status. The scraper runs locally; the dashboard reads user-scoped data through Supabase Auth and row-level security.

## Features

- Discover vacancies across Irish employers, public-sector sites, and supported ATS boards.
- Rank candidate jobs using profile embeddings generated in the browser and SQL scoring in Supabase.
- Track applications, inspect score explanations, and filter by fit, salary, location, or status.
- Manage profiles, CVs, cover letters, invitations, and a responsive dashboard in English or Brazilian Portuguese.

## Quick start

Install [mise](https://mise.jdx.dev/) and Docker, then run:

```bash
mise install
pnpm install
npm run prepare
make dev
```

`make dev` starts local Supabase and Vite with a seeded development account. It offers to restore the newest local backup when one exists. Open the URL printed by Vite. Hosted credentials are not needed for local frontend development.

The first development or production build stages a pinned, quantized MiniLM model and ONNX Runtime WASM files under `public/`. This requires network access once; subsequent builds verify the local checksums. These generated assets stay out of Git. Browser inference runs from the deployed site's origin.

The scraper requires its own service-role credentials in `services/scraper/.env`. Follow the [scraper setup guide](services/scraper/README.md) before running a crawl.

## Common commands

| Command | Purpose |
| --- | --- |
| `make help` | Show local tasks |
| `make check` | Run frontend and scraper quality gates |
| `npm run build-storybook` | Verify the UI component catalog |
| `make scrape-validate` | Validate scraper configuration |
| `make scrape-test NAME="Kildare County Council"` | Test one employer |
| `make scrape` | Crawl, ingest, deduplicate, and generate job embeddings |
| `make scrape-backfill` | Generate vectors for existing jobs after migrating |
| `make db-types` | Regenerate TypeScript and Python database types |

## Repository

| Path | Role |
| --- | --- |
| `src/` | React app, queries, localization, and sector types |
| `packages/ui/` | Shared UI components and design tokens |
| `shared/` | Browser scoring defaults |
| `services/scraper/` | Python discovery, extraction, ingestion, and job embeddings |
| `supabase/` | Baseline migration, seed, SQL tests, and Edge Function |
| `docs/` | Architecture and operating guides |

## Guides

The [documentation index](docs/README.md) is the complete, trigger-based map for maintainers and agents.
These are the most common entry points:

| Topic | Guide |
| --- | --- |
| Architecture and components | [System architecture](docs/ARCHITECTURE.md) · [Component map](docs/COMPONENTS.md) |
| Scraping and scoring | [Scraper architecture](docs/SCRAPER_ARCHITECTURE.md) · [Scraper setup](services/scraper/README.md) |
| Database and security | [Schema and migrations](docs/DATABASE_SCHEMA.md) · [Security and tenancy](docs/SECURITY_AND_MULTI_TENANCY.md) |
| Development and release | [Local development](docs/LOCAL_DEVELOPMENT.md) · [Release and recovery](docs/RELEASE_AND_RECOVERY.md) |
| UI and quality | [Design system](docs/DESIGN_SYSTEM.md) · [UI package design](packages/ui/DESIGN.md) · [Accessibility](docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md) |
| Operations and standards | [Performance](docs/PERFORMANCE_AND_SCALABILITY.md) · [Monitoring](docs/ERROR_TRACKING_AND_MONITORING.md) · [Conventions](docs/STANDARDS_AND_CONVENTIONS.md) |
| Preventing regressions | [Failure contracts, code smells and safe cleanup](docs/REGRESSION_PREVENTION.md) |

The browser uses a publishable Supabase key; only the scraper and Edge Function use service-role credentials. Keep `.env` files and `.backups/` out of Git.

## Contributing

Run `make check` and `npm run build-storybook` before submitting changes. Database changes use a new forward migration and regenerated TypeScript and Python types.

## License

[MIT](LICENSE).

## Tenant isolation checks

`npm run db:test:tenancy` runs two-user database/Storage/RPC isolation tests against
the current local Supabase schema. It fails on stale migrations and never resets
local data. Browser tripwires and cache/session tests run with `npm run check`.
Lefthook requires the database gate before push; CI rebuilds the database and runs
it on every PR. See [Security & Multi-Tenancy](docs/SECURITY_AND_MULTI_TENANCY.md#6-tenant-regression-guardrails)
for the access inventory, new-feature requirements, and required GitHub merge checks.
