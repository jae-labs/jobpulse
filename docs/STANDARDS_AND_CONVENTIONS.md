# Engineering Standards & Conventions

Code quality standards and development conventions for JobPulse.

For the failure-to-test matrix, security review steps and safe removal rules, read
[Regression Prevention](REGRESSION_PREVENTION.md). Its contracts apply to new features
and refactors as well as bug fixes.

## 1. Type Safety & Schema

- **No `any`**: Strictly type all interfaces, handlers, and database interactions.
- **Single Source of Truth**: Import types from `src/types/database.types.ts` (React)
  and `database/models.py` (Python scraper).
- **Atomic Parity**: PostgreSQL schema in `supabase/migrations/` is the sole authority.
  Forward migrations must be immediately synchronized across both languages via
  `make db-types` (or `npm run db:types`). Zero drift is strictly enforced in CI.

## 2. Server State & Data Fetching

- **TanStack Query Only**: Manage server data via domain hooks exported through `src/hooks/useQueries.ts`. Do not use ad-hoc
  `useEffect` fetch loops.
- **Account Lifetime**: Reset view state per UID. Tenant query and mutation functions check session identity before and after asynchronous operations through `withActiveUser`. Never retain tenant placeholder data across query keys.
- **Cache Invalidation**: Mutations must invalidate query cache keys via the `queryKeys` factory.
- **Server Aggregation**: Delegate catalog filtering, sorting, and pagination to PostgreSQL stored procedures
  (`get_jobs_page`, `get_overview_metrics`).
- **One Matching Authority**: PostgreSQL compares matching inputs and enqueues profile/vector
  writes atomically. Do not reproduce its fingerprint rules or send an extra enqueue after every save.
  Explicit failed-work retry remains a caller-owned RPC.
- **Visible Failures**: Do not turn private export, mutation or inference failures into success-shaped
  fallback values. Search distinguishes loading, error/retry and empty results.

## 3. Localization (i18n)

- **No Hardcoded Strings**: All UI copy must consume translation keys via `useTranslation().t`.
- **Bundle Parity**: Maintain identical key sets in `src/locales/en/translation.json` and `src/locales/pt-BR/translation.json`.
- **Formatting**: Format dates and numbers using `formatDate` and `formatNumber` from `src/lib/i18n.ts`.

## 4. Design System & Accessibility

- **Design System First**: Use primitives from `@jae-labs/ui` (`Button`, `Card`, `TextField`, `Select`, `Pill`, `PageHeader`).
- **Semantic Tokens**: Style UI using `--ds-*` visual tokens or Tailwind `ds-*` classes. Do not use raw hex colors
  or one-off surface tints in views.
- **Separation**: `packages/ui/` must remain free of JobPulse domain types, Supabase clients, or translation hooks.
- **Chart Copy**: Keep tooltips data-focused; avoid repeated click instructions and redundant chart subtitles.
  The chart tooltip copy check runs as part of `npm run lint`.
- **WCAG 2.1 AA**:
  - Minimum 4.5:1 contrast for normal text; 3:1 for large text and interactive boundaries.
  - Visible keyboard focus rings (`ds-focus-ring`) must never be suppressed.
  - All interactive controls must be keyboard operable (`Tab`, `Enter`, `Space`).

## 5. Performance & Main-Thread Invariants

[Performance & Scalability](PERFORMANCE_AND_SCALABILITY.md) owns rendering, virtualization,
formatter caching and server-aggregation rules. Consult it before changing those paths.

## 6. Python & Scraper Service (`services/scraper/`)

- **Code Style & Formatting**: Enforced via Ruff (`pyproject.toml`). Line length is 120. Formatted with `uv run --locked ruff format` (or `make scrape-format`).
- **Linting Rules**: `E`, `F`, `I` (isort), `UP` (pyupgrade), `B` (flake8-bugbear). Verified via `make scrape-lint`.
- **Modular Provider Adapters**: All ATS and careers-board extraction logic must live in dedicated, stateless adapters under `services/scraper/scrapers/providers/`. Never bloat `listing.py` with inline parsing; use `listing.py` solely as a high-level dispatcher.
- **Provider Test Fixtures**: Every new provider adapter must include isolated unit tests with mock responses or fixture HTML in `services/scraper/tests/test_provider_adapters.py`.
- **Type Safety**: Strictly annotate function signatures and models. Use Pydantic v2 models
  generated from live Supabase schema (`database/models.py`).
- **Resilient Network I/O**: Network requests must use retry mechanisms (`retry_supabase`,
  `http_client.py` with fallback and backoff).
- **Security Boundary**: The scraper uses `SUPABASE_SERVICE_ROLE_KEY` to ingest opportunities.
  Never leak, import, or bundle service role logic into the frontend application.
- **Thread Safety**: Singletons and ML models must be synchronized across threads (`threading.Lock` / `threading.RLock`). Never share un-synchronized mutable state across worker threads.

## 7. Verification and Review

Run `make check` for frontend lint, typecheck, tests and build plus scraper Ruff, Pyright and tests.
Run the additional domain gates in [AGENTS.md](../AGENTS.md#required-verification).

CI audits locked JavaScript/Python dependencies and scans repository history with a
checksum-verified Gitleaks release. Lefthook scans staged changes; CI remains mandatory
when hooks are skipped. TypeScript rejects unused locals and parameters; translation
lint validates static keys in both bundles, while dynamic keys need behavioral tests.

Diagnostics use `reportError` for sanitized production reporting and `warn` for
development-only messages. Source lint rejects telemetry imports and direct console
output outside their boundaries; never add exceptions to hide a security failure.
See [Error Tracking](ERROR_TRACKING_AND_MONITORING.md) for the reporting contract.

Use focused, descriptive commit subjects that identify the behavior changed
(e.g. `fix: reject stale-account profile writes`). Repeating a generic subject
meets Conventional Commit syntax but does not help reviewers or incident triage.
Preserve existing history; improve future commits instead of rewriting shared work.
