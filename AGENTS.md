# AGENTS.md

## Mission

- Treat this repository as production frontend infrastructure for JobPulse.
- Optimize for high performance, customizable dashboard layout, responsive hairline dark UI,
  and robust Supabase data synchronization.
- Maintain strict TypeScript type safety and quick verification cycles.

## Start Here

- Install local tooling: `mise install`
- Install dependencies: `npm install`
- Install Git hooks: `npm run prepare` (or `lefthook install`)
- Configure environment:
  - Copy `.env.example` to `.env`
  - Populate `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_ANON_KEY`
- Start development server: `npm run dev`
- Optional pre-commit hook run: `lefthook run pre-commit`
- Full local completion gate: `npm run check`

## Required Verification

Run the verification sequence before completing any task:

```bash
npm run lint       # oxlint fast linting
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build
```

Or run the combined gate:

```bash
npm run check
```

`npm run check` is the minimum completion gate before opening a PR or marking work as complete.

## Repo Shape & Routing

- Entrypoint & Shell: `index.html`, `src/main.tsx`, `src/App.tsx`
- Dashboard Orchestration: `src/components/dashboard/`
  - Navigation tabs: `src/components/dashboard/navigation.ts`
  - Sidebar: `src/components/dashboard/DashboardSidebar.tsx`
  - Draggable dashboard widgets: `src/components/dashboard/SortableWidget.tsx`
  - Layout persistence: `src/lib/dashboardStorage.ts`
- Job Pipeline & Tracking: `src/components/jobs/`
  - Master-detail and list views: `src/components/jobs/JobsView.tsx`
  - Job card presentation: `src/components/jobs/JobCard.tsx`
  - Inspection drawers & modals: `src/components/jobs/JobDetailInspector.tsx`, `src/components/jobs/JobDetailModal.tsx`
- Analytics & Charts: `src/components/charts/` (lazy-loaded Recharts)
  - Pipeline stage breakdown: `src/components/charts/PipelineChart.tsx`
  - Relevance distribution: `src/components/charts/RelevanceDistributionChart.tsx`
  - Skills demand & frequency: `src/components/charts/SkillsFrequencyChart.tsx`
  - Domain category breakdown: `src/components/charts/CategoryBreakdownChart.tsx`
- Sourcing & Watchlists:
  - Employer tracking: `src/components/employers/EmployerWatchlist.tsx`
  - Sourcing telemetry: `src/components/sources/SourcesView.tsx`
- Candidate Profile & Scoring:
  - Profile preferences & target criteria: `src/components/profile/ProfileView.tsx`
  - Profile storage & defaults: `src/lib/userProfile.ts`, `src/lib/defaultProfile.ts`
- Authentication: `src/components/auth/`
  - Login view: `src/components/auth/LoginView.tsx`
  - Access control: `src/components/auth/AccessDeniedView.tsx`, `src/components/auth/authConfig.ts`
- Design System & Primitives: `src/components/ui/`
  - Command palette: `src/components/ui/CommandMenu.tsx`
  - Metric stat card: `src/components/ui/StatCard.tsx`
  - Status badge: `src/components/ui/StatusPill.tsx`
  - Radix wrappers: `button.tsx`, `dialog.tsx`, `sheet.tsx`
- Data & Types:
  - Supabase CLI migrations & config: `supabase/migrations/`, `supabase/config.toml`
  - Generated database types: `src/types/database.types.ts` (via `npm run db:types`)
  - Supabase client: `src/lib/supabase.ts` (typed via `createClient<Database>`)
  - Server state, queries & mutations: `src/hooks/useQueries.ts`, `src/lib/queryClient.ts` (TanStack Query)
  - Domain types: `src/types/job.ts` (Canonical statuses: `New`, `Applied`, `Interview`, `Interested`, `Not Interested`)

## Make Changes Safely

- Prefer small, focused diffs.
- Preserve component boundaries; avoid inflating `App.tsx` with view-specific state.
- Manage server state, caching, optimistic mutations, and background synchronization via TanStack Query hooks in `src/hooks/useQueries.ts` instead of manual `useState`/`useEffect` data fetchers.
- Keep Supabase database queries and mutations strongly typed via `src/types/database.types.ts` and `src/types/job.ts`.
- Never expose service role or privileged backend credentials to frontend client code;
  use only `VITE_SUPABASE_*` publishable keys.
- Preserve accessibility and keyboard shortcuts (e.g., `Cmd+K` / `Ctrl+K` for the Command Menu).
- Maintain responsive layout across desktop and mobile screens.

## Update Triggers

- If database tables, RLS, or schema change: create a migration (`npm run db:migration <name>`), push changes (`npm run db:push`), and regenerate types (`npm run db:types`).
- If data fetching or mutations change: update `src/hooks/useQueries.ts` and maintain clean query cache invalidation via `queryKeys`.
- If job models or pipeline stages change: update `src/types/job.ts`, `src/components/jobs/`, and charts together.
- If profile matching criteria change: update `src/lib/defaultProfile.ts`, `src/lib/userProfile.ts`,
  and `src/components/profile/ProfileView.tsx`.
- If navigation routes or views change: update `src/components/dashboard/navigation.ts`, `src/App.tsx`,
  and `src/components/ui/CommandMenu.tsx`.

## Boundaries

- Do not commit `.env` or sensitive Supabase auth tokens.
- Do not downgrade compiler or linting settings to bypass errors.
- Do not introduce server-only packages into client bundle.

## Notes For Agents

- Read `README.md`, `mise.toml`, `lefthook.yml`, and `package.json` before altering developer workflows.
- Always run `npm run check` and verify zero errors before reporting completion.
- Keep generated artifacts out of git reviews.
