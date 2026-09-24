<p align="center">
  <img
    src="public/favicon.svg"
    alt="JobPulse Logo"
    width="90"
  />
</p>

<p align="center">
  <a href="https://github.com/jae-labs/jobpulse/actions/workflows/ci.yml">
    <img
      src="https://github.com/jae-labs/jobpulse/actions/workflows/ci.yml/badge.svg"
      alt="CI"
    />
  </a>
  <a href="LICENSE">
    <img
      src="https://img.shields.io/github/license/jae-labs/jobpulse"
      alt="License"
    />
  </a>
  <a href="https://github.com/jae-labs/jobpulse/issues">
    <img
      src="https://img.shields.io/github/issues/jae-labs/jobpulse"
      alt="GitHub issues"
    />
  </a>
  <a href="https://github.com/jae-labs/jobpulse/stargazers">
    <img
      src="https://img.shields.io/github/stars/jae-labs/jobpulse"
      alt="GitHub stars"
    />
  </a>
  <a href="https://github.com/jae-labs/jobpulse/network">
    <img
      src="https://img.shields.io/github/forks/jae-labs/jobpulse"
      alt="GitHub forks"
    />
  </a>
  <a href="https://vite.dev">
    <img
      src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white"
      alt="Vite 8"
    />
  </a>
  <a href="https://react.dev">
    <img
      src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black"
      alt="React 19"
    />
  </a>
  <a href="https://tailwindcss.com">
    <img
      src="https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss&logoColor=white"
      alt="Tailwind CSS 4"
    />
  </a>
  <a href="https://supabase.com">
    <img
      src="https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase&logoColor=white"
      alt="Supabase"
    />
  </a>
  <a href="https://vitest.dev">
    <img
      src="https://img.shields.io/badge/Tests-Vitest-brightgreen?logo=vitest&logoColor=white"
      alt="Automated tests"
    />
  </a>
</p>

JobPulse is a modern career intelligence platform and customizable opportunity tracking dashboard.

It turns fragmented job seeking into a unified, candidate-first experience: matching opportunities against
candidate profiles, calculating skill compatibility scores, triaging roles through a keyboard-first
master-detail view, and tracking recruitment funnel progress across an interactive bento dashboard.

**Why JobPulse?**

- **Customizable Analytics Dashboard**: Reorderable bento analytics widgets backed by `@dnd-kit`. Widget order
  persists in this browser's local storage under the authenticated user's ID; it does not sync across devices.
- **Keyboard-First Opportunity Pipeline**: Two-pane master-detail list with keyboard cycling (`↑`/`↓` or `j`/`k`),
  full-screen reading (`f`), quick apply (`Enter`), and rapid status shortcuts (`a`/`i`/`t`/`n` for Applied,
  Interview, Interested, and Not Interested) with Supabase-backed status storage.
- **Catalog Refresh**: Refresh active data from the header, or return to a window after queries have become stale.
  The frontend does not receive live catalog change events.
- **Tailored Compatibility Scoring**: Automatically evaluates opportunities against your specific skills, target
  domains, seniority preferences, and compensation criteria.
- **Connected Opportunity Feeds**: Live status and telemetry across connected opportunity feeds and employer boards.
- **Funnel Analytics**: Interactive Recharts breakdown of pipeline velocity, skill frequency demand,
  and salary distributions.
- **Internationalization & Localization (i18n / l10n)**: Native bilingual support for English (`en` 🇬🇧) and
  Brazilian Portuguese (`pt-BR` 🇧🇷) powered by `i18next` with locale-aware date, number, and currency formatting.
- **Command Palette (`Cmd+K` / `Ctrl+K`)**: Keyboard-first navigation to quickly jump between views, search jobs,
  and execute actions.
- **High-Density Dark UI**: Linear-inspired hairline surfaces, crisp typography, and responsive drawer inspectors
  optimized for fast triage.
- **Extractable Design System**: Semantic visual tokens and reusable primitives that can later be published for
  other products without carrying JobPulse domain code.

## Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Routing**: React Router 7
- **Internationalization (i18n / l10n)**: `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- **Server State & Caching**: TanStack Query (`@tanstack/react-query`)
- **Styling & Accessible Primitives**: Tailwind CSS 4, Radix UI, CVA, and Lucide React icons
- **Dashboard Layout & Reordering**: `@dnd-kit` (core & sortable)
- **Data, Auth & Local Runtime**: Supabase CLI and `@supabase/supabase-js` (local Docker stack or hosted project)
- **Virtualization**: TanStack Virtual (`@tanstack/react-virtual`)
- **Visualizations**: Recharts
- **Command Menu**: `cmdk`
- **Testing, Linting & Type Safety**: Vitest, Testing Library, jsdom, Oxlint, and TypeScript (`tsc`)
- **Tooling & Git Hooks**: Mise + Lefthook

## Quick Start

Requires Node.js `22.12.0` or newer (pinned through `mise`).

1. **Install pinned tooling:**

   ```bash
   mise install
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Install Git hooks:**

   ```bash
   npm run prepare
   ```

4. **Start local development:**

   ```bash
   make dev
   ```

   This starts local Supabase and Vite. It does not require a hosted Supabase
   URL or key in `.env`.

5. **Run local quality checks:**

   ```bash
   npm run check
   ```

## Local Supabase Development

The repository includes a complete local Supabase stack, including migrations,
seed data, Auth, Storage, and Realtime. It is separate from the hosted project
and avoids hosted database and API traffic during development. Start it with:

```bash
make dev
```

This command reads the local Supabase URL and anon key at runtime, so it
overrides any hosted values in `.env`. The development server automatically signs in
to the seeded local account (`admin@example.com`), retaining an authenticated
JWT so local Row Level Security policies are still exercised.

When a `.backups/jobpulse-*/data.sql` backup is available, `make dev` always
asks whether to import the newest one. Answering `y` resets only the local
database, restores the backup data, then recreates the local development
account. Answering anything else keeps the existing local database intact.
To restore a particular backup manually:

```bash
make db-restore BACKUP=.backups/jobpulse-<timestamp>
```

The local automatic sign-in is restricted to Vite development mode and a
`localhost`/`127.0.0.1` Supabase URL; it cannot bypass authentication in a
production build or against a hosted Supabase URL. `make dev` keeps existing
local data unless you confirm its backup-import prompt. Reset deliberately with
`make db-reset`.

`npm run dev` is an alias for local development. Use `npm run dev:hosted` only
when you intentionally configure hosted Supabase credentials in `.env`.

## Production Database Backups

`make dump` creates a timestamped logical backup containing the linked
production database's roles, schema, and data:

```bash
make dump
```

The CLI may prompt for the linked project's database password. For a
database-only dump, you may instead provide `SUPABASE_DB_URL` with a
session-pooler (or, where supported, direct) connection string from the
Supabase **Connect** panel. The command writes
`roles.sql`, `schema.sql`, and `data.sql` to
`.backups/jobpulse-<UTC timestamp>/`; this directory is Git-ignored and created
with owner-only permissions. Do not commit, share, or leave these files on an
unencrypted machine.

This is a database backup, not a complete application backup: Supabase Storage
object files are not stored in Postgres and must be backed up separately if
they are in use.

`make storage-export` discovers every bucket available in the linked Supabase
project and downloads its objects. For one timestamped backup directory
containing both the logical database dump and every Storage bucket:

```bash
make backup
```

`make backup` always uses the linked project for both database and Storage, so
it cannot accidentally combine data from two projects. Use `make dump` when a
database URL is required.

The Storage export uses Supabase CLI's experimental Storage copy support, so
rerun it after updating the Supabase CLI and verify a restore periodically.
`make dev` imports exported Storage files after restoring a backup. To import
them into an already-restored local database, run
`make storage-import BACKUP=.backups/jobpulse-<timestamp>`.

Before a production schema change, add a forward migration and regenerate
types. To inspect whether local migrations still match the linked production
schema, run `npm run db:diff`; review its output before creating a migration.

## Repository Structure

```text
├── .github/
│   ├── dependabot.yml           # Weekly automated dependency updates
│   └── workflows/
│       └── ci.yml               # CI build and code quality verification
├── public/                      # Static assets and icons
├── src/
│   ├── assets/                  # Hero and bundled media assets
│   ├── components/
│   │   ├── auth/                # Supabase login and access control
│   │   ├── charts/              # Pipeline, relevance, and skill charts
│   │   ├── dashboard/           # Sidebar, navigation, and sortable widgets
│   │   ├── jobs/                # Master-detail split, list view, and detail inspector
│   │   ├── profile/             # Candidate criteria and scoring weights
│   │   ├── sources/             # Data sources and connected feed status
│   │   └── ui/                  # Reusable primitives (buttons, sheets, cmdk)
│   ├── hooks/                   # TanStack query and mutation hooks (useQueries.ts)
│   ├── lib/                     # Supabase client, query client, storage, profile & i18n utils
│   ├── locales/                 # Internationalization bundles (en, pt-BR)
│   ├── types/                   # Domain & database types (job.ts, database.types.ts)
│   ├── App.tsx                  # Root application shell and view router
│   └── main.tsx                 # Entrypoint
├── docs/                        # Architecture, components, schema, and security documentation
├── supabase/                    # Supabase configuration & versioned migrations
│   ├── config.toml              # Supabase CLI project config
│   └── migrations/              # SQL schema migrations
├── AGENTS.md                    # Operational guidelines for AI agents
├── CODEOWNERS                   # Repository code ownership
├── lefthook.yml                 # Pre-commit and pre-push Git hook triggers
├── mise.toml                    # Tool version specifications
├── package.json                 # Project dependencies and lifecycle scripts
└── vite.config.ts               # Vite bundler configuration
```

## Quality Verification

Run checks in order, or use `npm run check` for the full pipeline:

```bash
# Fast linter
npm run lint

# TypeScript compilation check without emit
npm run typecheck

# Production build
npm run build

# Combined gate
npm run check
```

For an invite-only release, use the [Release and Recovery Checklist](docs/RELEASE_AND_RECOVERY.md). The repository's
`make backup` command creates a manual local export; it does not configure scheduled production recovery.

The application is intentionally not indexed by search engines because it is an authenticated personal dashboard.
See [Quality, Accessibility & Compatibility](docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md) for the accessibility,
locale, browser-support, security-header, performance, and release-validation standards.

## Documentation

JobPulse technical documentation is organized for progressive discovery—start with the high-level architecture or jump directly to the specific guide matching your domain:

### Architecture & Design
- **[Architecture Overview](docs/ARCHITECTURE.md)**: High-level system topology, runtime boundaries, TanStack Query data flow, and Mermaid sequence diagrams.
- **[Component Hierarchy](docs/COMPONENTS.md)**: Component tree, master-detail layout, UI boundaries, props contracts, and refactoring guidelines.
- **[Design System](docs/DESIGN_SYSTEM.md)**: Semantic visual tokens (`--ds-*`), hairline dark primitives, accessibility contract, and standalone extraction boundaries.

### Data & Security
- **[Database Schema & Migrations](docs/DATABASE_SCHEMA.md)**: PostgreSQL tables, versioned migrations, server RPC functions, and entity-relationship models.
- **[Security & Multi-Tenancy](docs/SECURITY_AND_MULTI_TENANCY.md)**: Row-Level Security (RLS) enforcement, Supabase Storage isolation, tenant boundaries, and PII protection.

### Engineering & Quality
- **[Engineering Standards & Conventions](docs/STANDARDS_AND_CONVENTIONS.md)**: TypeScript guidelines, TanStack Query caching conventions, Git lifecycle hooks, and automated verification gates.
- **[Quality, Accessibility & Compatibility](docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md)**: WCAG 2.1 AA baseline, keyboard navigation cycling, i18n/l10n standards, and browser support.
- **[Performance & Scalability](docs/PERFORMANCE_AND_SCALABILITY.md)**: Read paths, TanStack Virtual list tuning, query caching strategies, and invite-only benchmarks.

### Operations, Observability & Delivery
- **[Local Development, Backups & Restore](docs/LOCAL_DEVELOPMENT.md)**: Local Supabase Docker stack, migration parity, production backup, and Storage restore commands.
- **[Error Tracking & Monitoring](docs/ERROR_TRACKING_AND_MONITORING.md)**: Sentry error reporting architecture, Content Security Policy integration, user context, and PII safeguards.
- **[Release and Recovery Checklist](docs/RELEASE_AND_RECOVERY.md)**: Launch gates, staged rollout, backup and restore readiness, and incident response runbooks.

See [docs/README.md](docs/README.md) for the central documentation index.

## Contributing

See [Engineering Standards and Conventions](docs/STANDARDS_AND_CONVENTIONS.md) and
[Local Development](docs/LOCAL_DEVELOPMENT.md).

## Agent Notes

For coding assistants and autonomous agents, see [AGENTS.md](AGENTS.md).

## License

MIT License. See [LICENSE](LICENSE).

## Star History

<p align="center">
  <a href="https://www.star-history.com/#jae-labs/jobpulse&type=date">
    <img
      src="https://api.star-history.com/svg?repos=jae-labs/jobpulse&type=date&legend=top-left"
      alt="Star History Chart"
    />
  </a>
</p>
