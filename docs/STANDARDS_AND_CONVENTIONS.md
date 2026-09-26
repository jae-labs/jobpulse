# Engineering Standards & Conventions

Code quality standards and development conventions for JobPulse.

## 1. Type Safety & Schema

- **No `any`**: Strictly type all interfaces, handlers, and database interactions.
- **Single Source of Truth**: Import types from `src/types/database.types.ts` (React)
  and `database/models.py` (Python scraper).
- **Atomic Parity**: PostgreSQL schema in `supabase/migrations/` is the sole authority.
  Forward migrations must be immediately synchronized across both languages via
  `make db-types` (or `npm run db:types`). Zero drift is strictly enforced in CI.

## 2. Server State & Data Fetching

- **TanStack Query Only**: Manage server data via hooks in `src/hooks/useQueries.ts`. Do not use ad-hoc
  `useEffect` fetch loops.
- **Cache Invalidation**: Mutations must invalidate query cache keys via the `queryKeys` factory.
- **Server Aggregation**: Delegate catalog filtering, sorting, and pagination to PostgreSQL stored procedures
  (`get_jobs_page`, `get_overview_metrics`).

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

- **No Forced Synchronous Layouts**: Avoid `getComputedStyle(document.documentElement)` in render lifecycles. Read CSS custom properties through `getCachedCssVar` in `src/lib/chartTheme.ts`.
- **Chart Animation Restraint**: Multi-chart dashboard views must specify `isAnimationActive={false}` on Recharts components to prevent concurrent 1500ms `requestAnimationFrame` loops during initial render and tab switching.
- **Virtual List Ref Stability**: Never pass inline arrow ref callbacks (`ref={(el) => ...}`) to virtualized cards. Cache ref callbacks by item ID using `getCardRefCallback(id)` to prevent commit-phase churn (`ref(null)` -> `ref(el)`).
- **Single-Pass Reductions**: Consolidate multi-filter counts (status, salary brackets, regional locations) and histogram bucket calculations into a single $O(N)$ pass. Avoid chaining multiple `.filter()` loops across large job arrays.
- **Component Memoization & Stable Props**: Wrap virtual cards, inspectors, pill badges, and analytics charts in `React.memo`. Ensure all handler callbacks passed from parent views are wrapped in `useCallback`.
- **Intl Formatter Caching**: Never instantiate `new Intl.DateTimeFormat` or `new Intl.NumberFormat` on render ticks or in loops. Use the module-level caches in `src/lib/i18n.ts`.

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

## 7. Verification Gate

Always verify the completion gate before submitting changes:

```bash
make check  # npm run check + scrape-lint + scrape-unit
```
