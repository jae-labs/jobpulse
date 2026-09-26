# Component Hierarchy & Layout

JobPulse organizes UI components into modular views, layout shells, and product-neutral design primitives.

## Layout Hierarchy

```text
App (Root Shell & Providers)
├── Header (Active section, brand mark, language switch, UserAccountMenu)
├── DashboardSidebar (Desktop navigation & route links)
├── Main Workspace (Route container)
│   ├── Overview (Bento grid: StatCards + lazy Recharts)
│   ├── JobsView (Master-detail pipeline: Filters, list, inspector)
│   ├── SourcesView (Connected feeds, sync status, telemetry)
│   └── ProfileView (Candidate preferences, scoring rules, document vault)
├── InvitationsModal (Team member invitations, link sharing, and revocation)
├── Mobile Bottom Nav (Compact navigation bar on small screens)
└── CommandMenu (Cmd+K global search & action palette)
```

## View Modules

- **`OverviewView`** (`src/components/dashboard/OverviewView.tsx`): Reorderable bento grid via `@dnd-kit`, lazy-loaded pipeline and distribution charts, and summary stat cards.
- **`JobsView`** (`src/components/jobs/JobsView.tsx`): Keyboard-driven two-pane pipeline triage (`useKeyboardNavigation.ts`), search filters, and detail inspection sheet. Supports cycling opportunities in both split and fullscreen modes via `ArrowUp` and `ArrowDown` shortcuts.
- **`InvitationsModal`** (`src/components/dashboard/InvitationsModal.tsx`): Manages workspace colleague invites, generates unique invite URLs, displays pending invites with one-click copy, and allows hard-deleting pending invites.
- **`UserAccountMenu`** (`src/components/dashboard/UserAccountMenu.tsx`): User profile avatar menu with shortcuts to Profile, Invitations modal trigger, bilingual language toggle, and account logout.
- **`ProfileView`** (`src/components/profile/`): Decomposed into sub-views:
  - `ProfileGeneralInfo.tsx`: Identity, contact, avatar upload.
  - `ProfileTargetPreferences.tsx`: Target roles, locations, salary, work mode.
  - `ProfileQualifications.tsx`: Career summary, seniority rules, education, certifications, languages.
  - `ProfileMatchingTerms.tsx`: Single tag list for positive alignment, competencies, and tools while preserving stored scoring rules.
  - `ProfileDocuments.tsx`: Streaming document vault for CVs and cover letters.
  - `ScoringRulesEditor.tsx`: Exclusion and disqualifier tags, followed by scoring weights with a live preview beside the sliders on wide screens.
- **`SourcesView`** (`src/components/sources/SourcesView.tsx`): Source connector telemetry, health status, and opportunity counts.

## Design System vs Application UI

- **`packages/ui/`**: Internal `@jae-labs/ui` package with generic UI primitives (`Button`, `Card`, `TextField`, `Select`, `Pill`, `PageHeader`, `EmptyState`) styled exclusively with `--ds-*` semantic tokens.
- **`src/components/ui/`**: JobPulse-specific UI and dialog components (`CommandMenu`, `StatCard`, `StatusPill`, `ErrorBoundary`, `BrandLogo`).

## Component Memoization & Rendering Isolation

To prevent rendering cascades across heavy views:
- **Leaf Components**: `JobCard`, `JobDetailInspector`, `StatusPill`, `MatchScoreBadge`, and `StatCard` are wrapped in `React.memo`. This guarantees that list scrolling, focus changes, or typing in the search bar do not re-render unaffected cards or the inspector.
- **Container Views & Shell**: `OverviewView`, `SortableWidget`, `DashboardSidebar`, and `SourcesView` are wrapped in `React.memo`.
- **Callback Invariants**: Shell-level handlers in `App.tsx` (`handleSelectJob`, `updateStatus`, `handleNavigateToJobs`, `handleFilterReset`, `handleOpenCommandMenu`) and drill-downs in `OverviewView.tsx` are wrapped in `useCallback`.
- **Virtual List Ref Stability**: Cards in `JobsView` receive a memoized ref callback via `getCardRefCallback(job.id)` to avoid commit-phase callback churn across mounted items.

