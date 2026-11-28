# Component Hierarchy & Layout

JobPulse organizes UI components into modular views, layout shells, and product-neutral design primitives.

## Layout Hierarchy

```text
App (Root Shell & Providers)
├── Header (Active section, brand mark, NotificationsPanel, UserAccountMenu)
├── DashboardSidebar (Desktop navigation & route links)
├── Main Workspace (Route container)
│   ├── Overview (Bento grid: StatCards + lazy Recharts)
│   ├── JobsView (Master-detail pipeline: Filters, list, inspector)
│   ├── ProfileView (Candidate preferences, scoring rules, document vault)
│   ├── TaxCalculatorView (Client-side Irish pay planning)
│   ├── PrivacyView (Privacy notice and account export)
│   └── MemberManagementView (Team member invitations, link sharing, and revocation)
├── Mobile Bottom Nav (Compact navigation bar on small screens)
└── CommandMenu (Cmd+K global search & action palette)
```

## View Modules

- **`OverviewView`** (`src/components/dashboard/OverviewView.tsx`): Reorderable bento grid via `@dnd-kit`, lazy-loaded pipeline and distribution charts, and five summary stat cards on one desktop row (two per row on mobile), followed by Application Pipeline as the first large widget. Mobile charts span the full row. Reset Layout appears in the app header only for a customized layout and restores the default order and sizes for the current account; the pipeline placement is migrated once so later custom orders remain intact. Dragging translates widgets without scaling them to the target. Subtle border-corner handles resize widgets by dragging or keyboard arrows; clicking alone leaves the size unchanged; dragging and resizing snap to an invisible column grid and 40-pixel height steps. Bounded widths and heights persist separately from order in account-scoped browser storage. Mobile order and sizes use independent keys; desktop retains existing saved layouts. Crossing the 768px breakpoint remounts the layout to avoid mixing state or in-progress interactions. Mobile widths snap to half/full rows and heights to complete tracks including their gaps; drag handles use the same top-right placement with reserved label space.
- **`JobsView`** (`src/components/jobs/JobsView.tsx`): Keyboard-driven two-pane pipeline triage (`useKeyboardNavigation.ts`), search filters, and detail inspection sheet. Supports cycling opportunities in both split and fullscreen modes via `ArrowUp` and `ArrowDown` shortcuts.
- **`ScoringProgress`** (`src/components/dashboard/ScoringProgress.tsx`): Shows active matching progress and pending browser-vector setup with an explicit retry. Completed and failed backend-work states render no banner; background polling and durable retries continue. Progress-query failures retain their retry control.
- **`MemberManagementView`** (`src/components/dashboard/MemberManagementView.tsx`): In-app **Invite and manage members** page at `/members`, reached from the account menu or command palette. Creates invitation links, copies newly created links, lists the current account’s pending invitations and accepted members, and deletes pending invitations. Database authorization limits the directory and actions to the current account’s own invitations.
- **`NotificationsPanel`** (`src/components/dashboard/NotificationsPanel.tsx`): Header bell opens a full-height modal sheet sliding in from the right for desktop and a full-screen sheet on mobile. Uses design-system motion (disabled for reduced motion), surfaces, safe-area spacing, focus trapping, Escape dismissal and focus return. Currently displays an empty state; notification delivery, OneSignal, push permissions and persistence are not integrated.
- **`UserAccountMenu`** (`src/components/dashboard/UserAccountMenu.tsx`): User profile avatar menu with Account settings for Profile and Invite and manage members, a bilingual language toggle, a Security section containing Data and privacy, and account logout.
- **`ProfileView`** (`src/components/profile/`): Decomposed into sub-views:
  - `ProfileGeneralInfo.tsx`: Identity, contact, avatar upload.
  - `ProfileTargetPreferences.tsx`: Target roles, locations, salary, work mode.
  - `ProfileQualifications.tsx`: Career summary, seniority rules, education, certifications, languages.
  - `ProfileMatchingTerms.tsx`: Single tag list for positive alignment, competencies, and tools while preserving stored scoring rules.
  - `ProfileDocuments.tsx`: Streaming document vault for CVs and cover letters.
  - `ScoringRulesEditor.tsx`: Exclusion and disqualifier tags, followed by scoring weights with a live, five-row list of the highest scoring opportunities beside the sliders on wide screens. The list recomputes scores and ranking as weights move.
- **`TaxCalculatorView`** (`src/components/tax/TaxCalculatorView.tsx`): Client-side pay and contractor estimates at `/tax-calculator`.
- **`PrivacyView`** (`src/components/privacy/PrivacyView.tsx`): In-app data and privacy notice at `/privacy`, reached from the account menu or command palette. Ends with account-data export and the Danger zone, including email confirmation for account deletion through the existing mutation. Profile retains profile editing and document management.

## Design System vs Application UI

- **`packages/ui/`**: Internal `@jae-labs/ui` package with generic UI primitives (`Button`, `Card`, `TextField`, `Select`, `Pill`, `PageHeader`, `EmptyState`) styled exclusively with `--ds-*` semantic tokens.
- **`src/components/ui/`**: JobPulse-specific UI and dialog components (`CommandMenu`, `StatCard`, `StatusPill`, `ErrorBoundary`, `BrandLogo`).

## Component Memoization & Rendering Isolation

[Performance & Scalability](PERFORMANCE_AND_SCALABILITY.md#2-main-thread--rendering-performance)
owns memoization and callback rules. Preserve rendering isolation when changing the hierarchy above.

## Geographic browsing

`JobsMapView` owns account/filter-scoped worldwide map queries and pin selection. `JobsMapCanvas` owns the
MapLibre camera, GPU source and controls; `jobMapStyle` applies semantic map colors. `JobsMapLocationPanel` shows
role/company labels and bounded location pages using the existing catalog RPC.
Public sample labels use `useJobMapPreviewQuery` with an account-scoped key and
identity checks around asynchronous work. No candidate scores or tracking fields are read from
shared job rows. The map remains independent of loaded list pages.

Compact opportunity layouts default to list. A mobile map selection resolves stored
posting locations through the account-scoped preview query, then updates the location
filter, returns to list and focuses/scrolls the results. Multi-location groups require
an explicit location choice. Desktop selections retain the map side panel.
