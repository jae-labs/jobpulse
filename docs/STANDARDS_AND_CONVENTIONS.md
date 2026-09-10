# Engineering Standards & Code Conventions

This document establishes the code quality standards, architecture guidelines, and development conventions for
the JobPulse codebase.

## 1. Type Safety & Schema Parity

- **Strict Typing**: Never use `any` when defining interfaces or database row structures.
- **Database Types**: Always import types from `src/types/database.types.ts` or `src/types/job.ts`.
- **Schema Lifecycle**: When modifying database columns or tables:
  1. Add a migration in `supabase/migrations/`.
  2. Push with `npm run db:push`.
  3. Regenerate types with `npm run db:types`.
  4. Ensure `src/types/job.ts` mirrors the database schema.

## 2. State Management Rules

- **Server State vs. Client State**:
  - **Server state** (jobs, sources, profiles, evaluations) must be managed exclusively through TanStack Query
    hooks in `src/hooks/useQueries.ts`.
  - **Do NOT** use ad-hoc `useEffect` fetch loops or store remote data in uncoordinated `useState` containers.
- **Cache Invalidation**:
  - Mutating operations must invalidate query keys via `queryKeys` factory methods.
  - Use optimistic UI updates with rollback handlers for fast-responding actions.

## 3. Internationalization (i18n) & Localization (l10n)

- **String Decoupling**: Never hardcode user-facing strings in UI components. Maintain parity across
  `src/locales/en/translation.json` and `src/locales/pt-BR/translation.json`.
- **String Consumption**: Consume localized strings exclusively via the `useTranslation().t` hook.
- **Locale-Aware Formatting**: Always format timestamps, dates, and numbers through `formatDate` and `formatNumber`
  from `src/lib/i18n.ts` instead of raw unlocalized `.toLocaleDateString()` or JavaScript string concatenation.
- **Pluralization & Parameterization**: Use i18next variable interpolation (`{{count}}`, `{{date}}`) and plural
  suffixes (`_one`, `_other`) to support localized grammar rules.
- **Language State & Detection**: Supported locales are English (`en` 🇬🇧) and Brazilian Portuguese (`pt-BR` 🇧🇷).
  Language selection is persisted to `localStorage` under `jobpulse_lng`.

## 4. Accessibility (a11y) & Contrast Standards

- **WCAG 2.1 AA Compliance**: All user interfaces must satisfy WCAG 2.1 AA contrast requirements:
  - **Normal Text**: Minimum contrast ratio of **4.5:1** against underlying container surfaces.
  - **Large Text & Headers**: Minimum contrast ratio of **3:1** (18pt / 14pt bold and above).
  - **Non-Text Elements & Boundaries**: Minimum contrast ratio of **3:1** for input boundaries, form
    controls, focus indicators, and graphical states (WCAG SC 1.4.11).
- **Hairline Dark Theme Palette Rules**:
  - Primary text and headings: `text-white` or `text-zinc-100` (>14:1 contrast ratio on `#111215` / `#16171b`).
  - Secondary text, labels, and specs: `text-zinc-200` or `text-zinc-300` (>10:1 contrast ratio).
  - Captions, timestamps, and subtle hints: Minimum `text-zinc-400` (6.8:1 to 7.5:1 contrast ratio).
  - **Never use** `text-zinc-500` (3.7:1) or `text-zinc-600` (2.2:1) for readable text or metadata.
- **Form Controls & Inputs**:
  - All form input containers and borders must use at least `border-zinc-700/80` or `border-white/[0.12]`.
  - Placeholder text must use at least `placeholder:text-zinc-400`.
- **Keyboard Operability & Focus**:
  - All interactive elements (cards, tabs, buttons, dialogs) must be reachable via `Tab` / keyboard navigation.
  - Visible focus rings (`focus-visible:ring-1 focus-visible:ring-indigo-500`) must never be suppressed.

## 5. Anti-Patterns to Avoid

- ❌ **Hardcoded User-Facing Copy**:
  Never render raw English or Portuguese strings directly inside JSX/TSX templates.
- ❌ **Low-Contrast Foreground Elements**:
  Never render user-visible text with `text-zinc-500` or `text-zinc-600` on dark canvas or surface panels.
- ❌ **Raw Date & Number Formatting**:
  Do not invoke `.toLocaleDateString()` without specifying the user's active locale (`i18n.language`). Use `formatDate()`.
- ❌ **Hardcoded Regional / Geographic Arrays**:
  Never hardcode specific city or county names in component code or database queries. Filter dynamically based
  on available dataset values.
- ❌ **Monolithic View Components**:
  Components exceeding 500 lines should be decomposed into cohesive sub-components with explicit prop boundaries.
- ❌ **Client-Side Bulk Fetches (`fetchAllRows`)**:
  Do not download whole database tables into browser memory. Delegate pagination, sorting, and aggregation
  to PostgreSQL stored procedures.
- ❌ **Unprotected `SECURITY DEFINER` Functions**:
  Always ensure stored procedures verify caller authorization (`public.is_authorized_user()`) and revoke execute
  privileges from `anon`.

## 6. Verification Gates

Before submitting a pull request or completing a task, verify the quality gate passes with zero errors:

```bash
# 1. Fast oxlint analysis
npm run lint

# 2. Markdown formatting & line length check
npx markdownlint-cli2 "**/*.md" "#node_modules"

# 3. TypeScript compilation
npm run typecheck

# 4. Production bundle build
npm run build

# 5. Combined verification gate
npm run check
```
