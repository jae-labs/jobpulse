# AGENTS.md

## Mission

- Treat this repository as production frontend infrastructure for JobPulse.
- Optimize for high performance, customizable dashboard layout, responsive hairline dark UI,
  and robust Supabase data synchronization.
- Maintain strict TypeScript type safety and quick verification cycles.

## Maintainer Preferences

- Documentation and code comments describe the current system: what it does, where it lives,
  how to use or change it, and why its constraints exist. Write in present tense.
- Do not include development timelines, personal names or attribution, approval anecdotes,
  editorial dates, past PR or commit references, before/after narratives, or historical reports.
  Keep technical identifiers, operational commands, and domain data accurate.
- Express regression guidance as behavior contracts linked to executable tests, without incident
  narratives or finding IDs. Preserve negative security tests and database invariants.
- Direct pushes are the normal Git workflow; pull requests are optional. History rewriting and
  force pushes are supported. Use `git push --force-with-lease` when publishing rewritten branch
  history, inspect the remote state first, and run the required checks before publishing.
- Git history rewriting does not permit editing applied database migrations, bypassing checks,
  exposing secrets, or resetting developer data. Hosted schema and configuration changes remain
  separate from publishing source.
- Apply these preferences to READMEs, guides, agent instructions, templates, and code comments.
  If a requested behavior conflicts with an unclear preference, ask a focused question and update
  the authoritative instructions with the answer.

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
- Full local completion gate: `make check` (`npm run check` is frontend-only)
- UI component catalog: `make storybook` (or `npm run storybook`); verify changes with `npm run build-storybook`

## Required Verification

### Scraper measurement and improvement process

- Every scrape is a measurement opportunity. `make scrape` and durable worker
  commands automatically archive a source report alongside their ignored logs.
  Report failures remain visible and fail the command without undoing crawl work.
- Start with `make scrape ARGS="--limit 10 --concurrency 2"`. After reviewing
  outcomes and confirming no new denials or worsening failures, raise the next
  bounded batch to at most 50 tasks and four concurrent slots. Review each log
  and generated report before increasing either bound. Track the configured source set,
  attempted sources, retries, dead work and outstanding detail/vector tasks.
- A batch is a review checkpoint, not an automatic retry loop: inspect
  `task_finished` statuses and per-source acquisition summaries, record useful
  route/parser/throttle findings in the ignored campaign checkpoint, then choose
  the next batch from due queue work without overriding six-hour/remote cooldowns.
  Include source count and status, requests/rates/denials, opportunities/writes
  (label cross-source sums as observations), and description coverage in each
  checkpoint. Separate blocked, unsupported, failed and verified-empty outcomes.
- Use public-page evidence and bounded probes before changing routes or parsers.
  Add a focused synthetic fixture and run the relevant checks before remeasuring;
  do not infer a safe request quota from a denial ordinal or a successful sample.
  When a source redirects or changes its page, verify the replacement route from
  the employer's first-party careers page. Treat challenges and captchas as
  blocked outcomes; do not bypass them or rotate identities to evade controls.
- Compare accuracy and completeness with speed: verify job identities, published
  opportunity counts, pagination and detail-body coverage. Missing salary or other
  unpublished fields stay unknown. A quicker failure or empty result is not an
  extraction improvement. Keep candidate matching separate.
- Evaluate the two-hour complete-cycle target using eligible source coverage,
  detail-body coverage, pending queue growth and actual elapsed time. Measure host
  pacing, network, extraction, persistence and vector stages separately; inclusive
  stages overlap and cannot be summed as wall time. A budget stop or faster failure
  does not establish completeness. Prefer verified route/body reuse and supported
  pagination filters before increasing request rates. Validate host tuning with a
  bounded sample, preserve automatic backoff and treat an accepted sample as evidence,
  never a guaranteed quota.
- Measure transport mix, request rates, denials and requests preceding throttling.
  Reuse verified source preferences and cooldown evidence. Change one adapter or
  policy at a time, add a meaningful synthetic regression, run the relevant gates,
  then remeasure a bounded source sample. Never bypass remote cooldowns to finish
  a campaign, and never interpret a short successful sample as a guaranteed quota.
- Maintain current process details in `docs/OPERATIONS.md` and implementation
  contracts in `docs/SCRAPER_ARCHITECTURE.md`. Keep operational run artifacts
  ignored; document reproducible behavior and tests, not incident narratives.

### Completion gates

Run `make check` before completion. It runs frontend lint, TypeScript, Vitest/Node tests
and production build (`npm run check`), plus scraper Ruff, Pyright and pytest.

Additional gates:
- UI package changes: `npm run build-storybook`, `npm run test:ui` and `npm run test:ui:visual`.
  CI runs the catalog build, blocking accessibility/interaction tests and pinned Linux visual checks.
  Update visual fixtures only for intentional changes and inspect every changed screenshot.
- Scraper package changes: `make scrape-package`; durable crawl/worker changes: `npm run db:test:crawl`.
- Every completed change: `npm run db:test:tenancy`; never reset a developer database to pass it.
- Database or matching changes: all SQL suites via `npm run db:test`, plus the relevant integration checks in [Release & Recovery](docs/RELEASE_AND_RECOVERY.md).

## Repo Shape & Routing

| Boundary | Entry points |
| --- | --- |
| App shell and navigation | `src/main.tsx`, `src/App.tsx`, `src/components/dashboard/navigation.ts` |
| Views and charts | `src/components/`; detailed topology in [Components](docs/COMPONENTS.md) |
| Shared design system | `packages/ui/src/index.ts`, `tokens.css`; read [package agent rules](packages/ui/AGENTS.md) and [design guide](packages/ui/DESIGN.md) before edits |
| Server state | `src/hooks/useQueries.ts`, domain query hooks, `src/lib/queryKeys.ts` |
| Profiles and scoring | `src/lib/userProfile.ts`, `defaultProfile.ts`, `src/components/profile/` |
| Localization | `src/lib/i18n.ts`, `src/locales/{en,pt-BR}/translation.json` |
| Database | `supabase/migrations/`, `config.toml`; generated models in `src/types/database.types.ts` and `services/scraper/src/jobpulse_scraper/database/models.py` |
| Scraper | `services/scraper/app.py`, `services/scraper/src/jobpulse_scraper/{config,scrapers,pipeline,engine,database,network,runtime,server}/` |

Pipeline statuses are `new`, `applied`, `interviewing`, `rejected`, `not_interested`.
Saved is the independent owner-only `is_saved` bookmark, not a stage.

## Documentation & Progressive Discovery

[`docs/README.md`](docs/README.md) is the canonical documentation index. It classifies every maintained
guide by owner, trigger, and source-of-truth status so agents can load only the material relevant to a change.
Use the table below as the fast routing layer; use the index when a task crosses domains or when adding,
renaming, consolidating, or retiring documentation.

Consult the relevant guides progressively based on the task domain:

| Domain / Task | Document | Read When / Trigger | Key Invariants |
| --- | --- | --- | --- |
| **System Architecture** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Altering runtime boundaries, state topology, or auth flow | Keep `App.tsx` shell lean; manage server state via TanStack Query. |
| **Scraper & Ingestion Pipeline** | [`docs/SCRAPER_ARCHITECTURE.md`](docs/SCRAPER_ARCHITECTURE.md) and [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Modifying adapters, board discovery, crawl/enrichment commands, websites.yaml, or scoring | Keep Python separate from web; service role key only for scraper. |
| **Component Hierarchy** | [`docs/COMPONENTS.md`](docs/COMPONENTS.md) | Adding views, modifying master-detail, or refactoring layouts | Preserve component boundaries; avoid prop drilling; keep views modular. |
| **Design System & Tokens** | [`packages/ui/DESIGN.md`](packages/ui/DESIGN.md) and [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Adding package UI, modifying colors, or adjusting tokens | Read `packages/ui/AGENTS.md`; use `--ds-*` tokens and keep application imports out of `packages/ui/`. |
| **Database & Migrations** | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Modifying tables, RPC functions, or database triggers | Forward migrations only; never edit applied migrations; regenerate types. |
| **Security & Multi-Tenancy** | [`docs/SECURITY_AND_MULTI_TENANCY.md`](docs/SECURITY_AND_MULTI_TENANCY.md) | Updating RLS policies, storage buckets, or auth boundaries | Ensure RLS on every table; isolate storage objects by `auth.uid()`. |
| **Error Tracking & Monitoring** | [`docs/ERROR_TRACKING_AND_MONITORING.md`](docs/ERROR_TRACKING_AND_MONITORING.md) | Touching error handling, Sentry config, or CSP headers | Never log PII; ensure CSP connect-src permits ingest endpoints. |
| **Performance & Scalability** | [`docs/PERFORMANCE_AND_SCALABILITY.md`](docs/PERFORMANCE_AND_SCALABILITY.md) | Tuning virtualization, main-thread performance, reflows, or caching | Zero forced reflows; stable virtual refs; memoized trees; single-pass $O(N)$ loops. |
| **Standards & Conventions** | [`docs/STANDARDS_AND_CONVENTIONS.md`](docs/STANDARDS_AND_CONVENTIONS.md) | Reviewing code style, TanStack Query patterns, git hooks, or CI | Strict TypeScript; no `any`; typed query keys; automated git hooks and CI. |
| **Accessibility & Quality** | [`docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md`](docs/QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md) | Modifying keyboard navigation, focus management, or i18n | WCAG 2.1 AA baseline; keyboard shortcuts (`↑`/`↓`, `Cmd+K`); full i18n strings. |
| **Local Workflow & Backups** | [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) | Working with local Supabase, Docker, seed data, or backups | Use local credentials; never commit `.backups/` or secrets. |
| **Release & Recovery** | [`docs/RELEASE_AND_RECOVERY.md`](docs/RELEASE_AND_RECOVERY.md) | Pre-deployment verification, launch gates, or incident response | Follow Required Verification; verify backup snapshots before schema changes. |
| **Regression Prevention** | [`docs/REGRESSION_PREVENTION.md`](docs/REGRESSION_PREVENTION.md) | Changing private data flows, matching, telemetry, catalog queries, or removing old code | Preserve the behavior-to-test matrix; remove redundant paths without removing safety evidence. |

Progressive discovery index: [`docs/`](docs/).

### Documentation maintenance

- Before adding a guide, first extend the closest maintained guide when the topic has the same owner and
  lifecycle. Create a new document only for an independently maintained subsystem or operational runbook
  with its own change trigger.
- Every new, renamed, consolidated, or retired guide must update [`docs/README.md`](docs/README.md), this
  routing table when its trigger changes, and any affected README links in the same change. Give the index an
  accurate trigger, owner/source-of-truth statement, and current policy status.
- Keep guides concise and current. Remove obsolete narratives and consolidate overlapping guidance.
  Preserve applied migrations, executable regression tests, and valid private recovery snapshots.
- When behavior, commands, configuration, boundaries, or standards change, review the relevant guide
  and update it in the same change. Verification summaries identify the guides reviewed. Keep normative completion gates in Required
  Verification; other guides link to that section and explain how their checks work.
- Run `npm run lint` after documentation changes. Its documentation check verifies links, anchors,
  package scripts, source paths, CI job declarations and complete index metadata. It does not establish
  architectural truth or runtime readiness; tie important guardrails to executable enforcement.

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
  (`npm run db:migration <name>`), test the complete chain with a reset on a disposable local stack,
  synchronize both TypeScript and Python types together (`make db-types` or `npm run db:types`),
  verify parity across both codebases (`git diff src/types/database.types.ts services/scraper/src/jobpulse_scraper/database/models.py`),
  inspect parity against remote (`npm run db:diff`), and follow the release guide for hosted application.
  Never edit an applied migration. CI enforces zero drift across both `src/types/database.types.ts`
  and `services/scraper/src/jobpulse_scraper/database/models.py`.
  On an existing developer database, apply pending versions with `supabase migration up --local`.
  A reset deletes local data; never use it as an automatic recovery from a stale tenant-test ledger.
- If data fetching or mutations change: update `src/hooks/useQueries.ts` and maintain clean query cache
  invalidation via `queryKeys`.
- If job models or pipeline stages change: update `src/types/job.ts`, `src/components/jobs/`, and charts together.
- If profile matching criteria change: update `src/lib/defaultProfile.ts`, `src/lib/userProfile.ts`,
  and `src/components/profile/ProfileView.tsx`.
- If navigation routes or views change: update `src/components/dashboard/navigation.ts`, `src/App.tsx`,
  and `src/components/ui/CommandMenu.tsx`.
- If user-facing strings, badges, or languages change: update `src/locales/en/translation.json` and
  `src/locales/pt-BR/translation.json`.

## Mandatory Tenant Isolation Contract

- Tenant isolation is a database invariant, never a frontend filter. Use the verified
  `auth.uid()` identity, not request UUIDs, email matches, or editable `user_metadata`.
- Classify every new public table/view and browser RPC in
  `supabase/tests/helpers/tenant_contract.sql`. Owner tables require a non-null UUID
  owner, RLS, and ownership checks for SELECT, INSERT, UPDATE, and DELETE. Shared
  catalog tables must contain no candidate scores, statuses, analysis, or PII.
- SECURITY DEFINER functions must use a fixed, safe search path, explicit grants,
  and enforce caller ownership before reading or writing private data. Browser
  access to internal scoring/maintenance functions or vector tables is forbidden.
- Invitations are private to their issuer and the account they authorize. Membership
  alone does not authorize reading another member's invitation codes or deleting them.
- Add real negative tests with two simultaneously authorized members whenever changing
  a table, policy, RPC, Storage path, grant, Auth boundary, or candidate data flow.
  Test owner success, foreign read/write denial, guessed IDs, forged identity,
  anonymous/uninvited/unconfirmed denial, and indirect RPC/Storage access as applicable.
  Run requests as `authenticated`/`anon`; tests running only as postgres/service role
  do not establish tenant isolation. Keep fixtures synthetic and rollback-only.
- Use `queryKeys` for every query definition and pass the active UID. Any deliberately
  shared or path-owned key requires an explicit classification and isolation test in
  `src/lib/queryKeys.test.ts`. Clear cached private data on identity changes/logout.
- Complete [Required Verification](#required-verification). `make check` includes the browser tenant
  tripwire self-tests; the separate tenant database gate verifies authorization. Database tests require the
  local migration ledger to match the checkout.
  Never reset a developer database automatically, skip a failed guard, loosen an
  assertion, or add a security exception merely to make a new feature pass.
- Report existing isolation failures as release blockers; do not claim readiness while
  the tenant gate is red. CI must run on every PR, including frontend-only changes.

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
- Complete [Required Verification](#required-verification) with zero errors before reporting completion.
- Keep generated artifacts out of git reviews.

## Production Regression Contract

Read [`docs/REGRESSION_PREVENTION.md`](docs/REGRESSION_PREVENTION.md) before changing the affected
subsystem. Instructions and lint are tripwires; database authorization and behavioral tests enforce
the contract. Do not claim that documentation guarantees future isolation.

- Account view state must remount when the authenticated UID changes. Tenant query/mutation functions
  use `withActiveUser` before and after asynchronous work. Never retain tenant `placeholderData`.
  After inference, verify both the active UID and the current profile content hash before saving a vector.
- PostgreSQL owns matching-input comparisons and atomic enqueueing. Profile/vector writes enqueue
  work in their transaction; the browser must not duplicate that logic or treat `rescore_user` returning
  zero as completed scoring. Use it for explicit failed-work retry or a shortlist-limit request.
- Shared job/vector writes advance catalog generation without per-candidate fan-out. Preserve exact
  shortlist coverage (up to 1,500), bounded slices, fair scheduling, durable missing-vector state,
  retries and tenant failure rollback. Weight-only edits recompose existing factors.
- Count and page results must use the same filtered SQL statement; CTEs never survive into a second
  statement. Preserve totals for empty/high-offset pages and stable ID tie breaks. Validate the shared
  status/salary/sort contract, bounded literal search, and location inputs at the database boundary.
- Overview match averages/distributions use assessed jobs only. Keep coverage visible, include
  Uncategorized jobs, and derive facets from the full server catalog. Search must expose loading,
  failure/retry and empty states without showing stale results after an error.
- Import Sentry only in `src/lib/sentry.ts`; application diagnostics use `reportError` or development-only
  `warn` from `src/lib/logger.ts`. No direct browser console output, user IDs, raw messages, request
  data, private context, tracing or replay. Consume invitation URL parameters before initializing telemetry.
- Defaults and fixtures must be neutral/synthetic. New personal fields require a documented purpose,
  owner-only access, export/deletion coverage and retention review. Never reuse real profiles or
  documents as fixtures. Keep functional public contact copy in the application; private identity is not a fixture or diagnostic.
- Age, an empty crawl or source failure is not closure evidence. Never restore age-only vacancy
  pruning. Deduplication must preserve candidate tracking through the service-only database contract.
- Keep dependency audits and secret scans enabled. Serve checksum-pinned model/runtime assets from
  the site origin in a bounded worker; verify inference under production CSP before an inference upgrade.
- When removing code, verify import/call references and external contracts. Remove its obsolete copy
  and tests, retain the negative regression for the unsafe behavior, and preserve applied migrations,
  generated schema parity, valid private backups and supported public APIs.
- Report source changes, applied database migrations and deployed frontend behavior separately.
  A green local build is not a hosted load test or proof that alerts, retention and recovery work.
