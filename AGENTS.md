# AGENTS.md

## Mission

- Treat this repository as production frontend infrastructure for JobPulse.
- Optimize for high performance, customizable dashboard layout, responsive hairline dark UI,
  and robust Supabase data synchronization.
- Maintain strict TypeScript type safety and quick verification cycles.

## Start Here

- Install local tooling: `mise install`
- Install dependencies: `pnpm install`
- Install Git hooks: `npm run prepare` (or `lefthook install`)
- Start local development: `make dev` (or `npm run dev`)
  - Starts the local Supabase Docker stack and Vite.
  - Uses local URL and keys at runtime; no hosted `.env` values are needed.
  - Prompts to restore the newest `.backups/` snapshot when one exists.
- Use `make help` to discover local database, backup, and Storage commands.
- Use `npm run dev:hosted` only when intentionally developing against hosted
  Supabase credentials configured in `.env`.
- Optional pre-commit hook run: `lefthook run pre-commit`
- Full local completion gate: `npm run check`
- UI component catalog: `npm run storybook`; verify changes with `npm run build-storybook`

## Required Verification

Run the verification sequence before completing any task:

```bash
npm run lint       # oxlint fast linting
npm run typecheck  # tsc -b --noEmit
npm run test       # vitest run
npm run build      # tsc -b && vite build
npm run build-storybook # standalone UI component catalog
```

Or run the combined monorepo gate:

```bash
make check         # npm run check + scrape-lint + scrape-unit
```

`make check` (or `npm run check`) is the minimum completion gate before opening a PR or marking work as complete. Also run
`npm run build-storybook` for UI package changes; CI runs it on every change.

## Repo Shape & Routing

- Entrypoint & Shell: `index.html`, `src/main.tsx`, `src/App.tsx`
- Dashboard Orchestration: `src/components/dashboard/`
  - Navigation tabs: `src/components/dashboard/navigation.ts`
  - Sidebar: `src/components/dashboard/DashboardSidebar.tsx`
  - Overview page: `src/components/dashboard/OverviewView.tsx`
  - Draggable dashboard widgets: `src/components/dashboard/SortableWidget.tsx`
  - Invitations modal: `src/components/dashboard/InvitationsModal.tsx`
  - Account menu: `src/components/dashboard/UserAccountMenu.tsx`
- Job Pipeline & Tracking: `src/components/jobs/`
  - Master-detail and list views: `src/components/jobs/JobsView.tsx`
  - Job card presentation: `src/components/jobs/JobCard.tsx`
  - Inspection drawers & modals: `src/components/jobs/JobDetailInspector.tsx`
- Analytics & Charts: `src/components/charts/` (lazy-loaded Recharts)
  - Pipeline stage breakdown: `src/components/charts/PipelineChart.tsx`
  - Relevance distribution: `src/components/charts/RelevanceDistributionChart.tsx`
  - Skills demand & frequency: `src/components/charts/SkillsFrequencyChart.tsx`
  - Domain category breakdown: `src/components/charts/CategoryBreakdownChart.tsx`
- Sourcing & Telemetry:
  - Sourcing telemetry: `src/components/sources/SourcesView.tsx`
- Candidate Profile & Scoring:
  - Profile preferences & target criteria: `src/components/profile/ProfileView.tsx`
  - Sub-views: `ProfileGeneralInfo.tsx`, `ProfileTargetPreferences.tsx`, `ProfileQualifications.tsx`, `ProfileMatchingTerms.tsx`, `ProfileDocuments.tsx`, `ScoringRulesEditor.tsx`
  - Profile storage & defaults: `src/lib/userProfile.ts`, `src/lib/defaultProfile.ts`
- Authentication & Fault Tolerance: `src/components/auth/`, `src/components/ui/`
  - Login view: `src/components/auth/LoginView.tsx`
  - Access control: `src/components/auth/AccessDeniedView.tsx`, `src/components/auth/authConfig.ts`
  - Fault tolerance: `src/components/ui/ErrorBoundary.tsx`
- Design System: `packages/ui/` (`@jae-labs/ui`)
  - Product-neutral tokens: `packages/ui/src/tokens.css`
  - Public component API: `packages/ui/src/index.ts`
  - Design decisions and component rules: `packages/ui/DESIGN.md`
  - Package-specific agent instructions: `packages/ui/AGENTS.md`
  - JobPulse integration: `docs/DESIGN_SYSTEM.md`
- JobPulse UI: `src/components/ui/`
  - Command palette: `src/components/ui/CommandMenu.tsx`
  - Metric stat card: `src/components/ui/StatCard.tsx`
  - Status badge: `src/components/ui/StatusPill.tsx`
- Internationalization & Localization (i18n / l10n):
  - Config & helpers: `src/lib/i18n.ts` (`formatDate`, `formatNumber`, language detection, persistence via `jobpulse_lng`)
  - Translation bundles: `src/locales/en/translation.json`, `src/locales/pt-BR/translation.json`
- Data & Types:
  - Supabase CLI migrations & config: `supabase/migrations/`, `supabase/config.toml`
  - Generated database types: `src/types/database.types.ts` (via `npm run db:types`)
  - Supabase client: `src/lib/supabase.ts` (typed via `createClient<Database>`)
  - Server state, queries & mutations: `src/hooks/useQueries.ts`, `src/lib/queryClient.ts` (TanStack Query)
  - Domain types: `src/types/job.ts` (Canonical statuses: `new`, `applied`, `interviewing`, `interested`, `not_interested`)
- Scraper & Ingestion Pipeline (`services/scraper/`):
  - Configuration: `services/scraper/config/websites.yaml`, `rules.py`, `loader.py`
  - Extraction & Crawling: `services/scraper/extractors/`, `services/scraper/scrapers/generic/` (dispatcher `listing.py`, `crawler.py`), `services/scraper/scrapers/core/`
  - Provider Adapters: `services/scraper/scrapers/providers/` (18+ modular ATS and board adapters)
  - Scoring & Validation Engine: `services/scraper/engine/` (SentenceTransformers Apple Metal GPU acceleration)
  - Supabase Service Role Integration: `services/scraper/database/` (thread-safe client, safe deduplication, safe pruning)
  - Local API & Daemon: `services/scraper/server/` (`api.py`), `app.py`

## Documentation & Progressive Discovery

Consult the relevant guides progressively based on the task domain:

| Domain / Task | Document | Read When / Trigger | Key Invariants |
| --- | --- | --- | --- |
| **System Architecture** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Altering runtime boundaries, state topology, or auth flow | Keep `App.tsx` shell lean; manage server state via TanStack Query. |
| **Scraper & Ingestion Pipeline** | [`docs/SCRAPER_ARCHITECTURE.md`](docs/SCRAPER_ARCHITECTURE.md) | Modifying scrapers, extractors, websites.yaml, or scoring | Keep Python separate from web; service role key only for scraper. |
| **Component Hierarchy** | [`docs/COMPONENTS.md`](docs/COMPONENTS.md) | Adding views, modifying master-detail, or refactoring layouts | Preserve component boundaries; avoid prop drilling; keep views modular. |
| **Design System & Tokens** | [`packages/ui/DESIGN.md`](packages/ui/DESIGN.md) and [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Adding package UI, modifying colors, or adjusting tokens | Read `packages/ui/AGENTS.md`; use `--ds-*` tokens and keep application imports out of `packages/ui/`. |
| **Database & Migrations** | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Modifying tables, RPC functions, or database triggers | Forward migrations only; never edit applied migrations; regenerate types. |
| **Security & Multi-Tenancy** | [`docs/SECURITY_AND_MULTI_TENANCY.md`](docs/SECURITY_AND_MULTI_TENANCY.md) | Updating RLS policies, storage buckets, or auth boundaries | Ensure RLS on every table; isolate storage objects by `auth.uid()`. |
| **Error Tracking & Monitoring** | [`docs/ERROR_TRACKING_AND_MONITORING.md`](docs/ERROR_TRACKING_AND_MONITORING.md) | Touching error handling, Sentry config, or CSP headers | Never log PII; ensure CSP connect-src permits ingest endpoints. |
| **Performance & Scalability** | [`docs/PERFORMANCE_AND_SCALABILITY.md`](docs/PERFORMANCE_AND_SCALABILITY.md) | Tuning virtualization, main-thread performance, reflows, or caching | Zero forced reflows; stable virtual refs; memoized trees; single-pass $O(N)$ loops. |
| **Standards & Conventions** | [`docs/STANDARDS_AND_CONVENTIONS.md`](docs/STANDARDS_AND_CONVENTIONS.md) | Reviewing code style, TanStack Query patterns, or git hooks | Strict TypeScript; no `any`; typed query keys; automated git hooks. |
| **Accessibility & Quality** | [`docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md`](docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md) | Modifying keyboard navigation, focus management, or i18n | WCAG 2.1 AA baseline; keyboard shortcuts (`↑`/`↓`, `Cmd+K`); full i18n strings. |
| **Local Workflow & Backups** | [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) | Working with local Supabase, Docker, seed data, or backups | Use local credentials; never commit `.backups/` or secrets. |
| **Release & Recovery** | [`docs/RELEASE_AND_RECOVERY.md`](docs/RELEASE_AND_RECOVERY.md) | Pre-deployment verification, launch gates, or incident response | Run `npm run check`; verify backup snapshots before schema changes. |

Progressive discovery index: [`docs/`](docs/).

## Make Changes Safely

- Prefer small, focused diffs.
- Preserve component boundaries; avoid inflating `App.tsx` with view-specific state.
- Manage server state, caching, optimistic mutations, and background synchronization via TanStack Query hooks in
  `src/hooks/useQueries.ts` instead of manual `useState`/`useEffect` data fetchers.
- Keep Supabase database queries and mutations strongly typed via `src/types/database.types.ts` and `src/types/job.ts`.
- Never hardcode user-facing copy; consume string keys through `useTranslation().t` and format dates and numbers
  via `formatDate` and `formatNumber`.
- Never expose service role or privileged backend credentials to frontend client code;
  use only `VITE_SUPABASE_*` publishable keys.
- Preserve accessibility and keyboard shortcuts (e.g., `Cmd+K` / `Ctrl+K` for the Command Menu).
- Keep chart tooltips focused on labels and values. Do not add repeated “Click to view” hints; retain
  keyboard-accessible interactions and visible focus on chart targets.
- Prevent forced synchronous reflows: read CSS variables through `getCachedCssVar` in `src/lib/chartTheme.ts`
  rather than `getComputedStyle(document.documentElement)` in render lifecycles.
- Disable continuous animation loops (`isAnimationActive={false}`) on multi-chart dashboard surfaces.
- Preserve ref callback stability in virtualized lists via `getCardRefCallback(id)` to prevent commit-phase thrashing.
- Maintain responsive layout across desktop and mobile screens.
- Use semantic `--ds-*` tokens and `@jae-labs/ui` primitives for new UI.
  Do not introduce raw hex or one-off structural colors in route components.
- Keep `packages/ui/` free of JobPulse domain imports, Supabase, routes,
  and translation hooks so it remains reusable across workspace applications.

## Update Triggers

- If database tables, RLS, or schema change: create a forward migration
  (`npm run db:migration <name>`), test it with a local reset (`make db-reset`),
  synchronize both TypeScript and Python types atomically (`make db-types` or `npm run db:types`),
  verify parity across both codebases (`git diff src/types/database.types.ts services/scraper/database/models.py`),
  inspect parity against remote (`npm run db:diff`), and push when ready (`npm run db:push`).
  Never edit an applied migration. CI enforces zero drift across both `src/types/database.types.ts`
  and `services/scraper/database/models.py`.
- If data fetching or mutations change: update `src/hooks/useQueries.ts` and maintain clean query cache
  invalidation via `queryKeys`.
- If job models or pipeline stages change: update `src/types/job.ts`, `src/components/jobs/`, and charts together.
- If profile matching criteria change: update `src/lib/defaultProfile.ts`, `src/lib/userProfile.ts`,
  and `src/components/profile/ProfileView.tsx`.
- If navigation routes or views change: update `src/components/dashboard/navigation.ts`, `src/App.tsx`,
  and `src/components/ui/CommandMenu.tsx`.
- If user-facing strings, badges, or languages change: update `src/locales/en/translation.json` and
  `src/locales/pt-BR/translation.json`.

## Boundaries

- Do not commit `.env` or sensitive Supabase auth tokens.
- Do not commit `.backups/`; it can contain production database and Storage data.
- Do not let TypeScript and Python database types drift out of lockstep; always run `make db-types` when migrations change.
- Do not downgrade compiler or linting settings to bypass errors.
- Do not introduce server-only packages into client bundle.

## Notes For Agents

- Read `README.md`, `docs/LOCAL_DEVELOPMENT.md`, `mise.toml`, `lefthook.yml`, and `package.json` before
  altering developer workflows.
- Consult the relevant guide (see
  [Documentation & Progressive Discovery](#documentation--progressive-discovery)) before modifying domain
  subsystems.
- Read `packages/ui/DESIGN.md` and `packages/ui/AGENTS.md` before changing the UI package.
- Always run `npm run check` and verify zero errors before reporting completion.
- Keep generated artifacts out of git reviews.
