# Component Architecture & Simplification Guide

This document outlines the visual layout hierarchy, component boundaries, and architectural refactoring
recommendations to reduce complexity and improve readability.

## Visual Layout Hierarchy

```text
App (Root Shell & Context Providers)
├── Header (Project Switcher, Active Section, User Profile Menu)
├── DashboardSidebar (Desktop Navigation, Route Links)
├── Main Workspace (Route Content Container)
│   ├── Overview (Bento Grid: StatCards + Lazy Recharts)
│   │   ├── StatCard: Tracked Opportunities
│   │   ├── StatCard: High-Fit Matches
│   │   ├── StatCard: In Active Pipeline
│   │   ├── CategoryBreakdownChart (Lazy)
│   │   ├── PipelineChart (Lazy)
│   │   ├── RelevanceDistributionChart (Lazy)
│   │   └── SkillsFrequencyChart (Lazy)
│   ├── JobsView (Master-Detail Pipeline Split)
│   │   ├── FilterToolbar (Query, Status Pills, Category, Salary, Location)
│   │   ├── JobCard List (Virtualized on long lists)
│   │   └── JobDetailInspector (Selected Role Details, Compatibility, Actions)
│   ├── SourcesView (Connected Opportunity Feeds, Telemetry, Health)
│   └── ProfileView (Candidate Details, Documents, Scoring Rules)
│       ├── Identity & Contact Section
│       ├── Target Career & Compensation Preferences
│       ├── Document Vault (CVs & Cover Letters)
│       └── ScoringRulesEditor (Matching Weights & Domain Rules)
├── Mobile Bottom Navigation Bar (Linear-style tab bar on small viewports)
└── CommandMenu (Cmd+K / Ctrl+K Global Search and Action Palette)
```

## Modular Decomposition & Component Health

The application maintains strict single-responsibility boundaries across views and layout orchestrators:

### 1. Extracted Overview View (`src/components/dashboard/OverviewView.tsx`)

- **Role**: Encapsulates the entire drag-and-drop sortable bento grid, lazy-loaded charts, and funnel summary stat cards.
- **Benefit**: Keeps `App.tsx` clean and lightweight as a shell and view orchestrator.

### 2. Decomposed Profile Sub-Views (`src/components/profile/`)

- `ProfileGeneralInfo.tsx`: Name, title, headline, location, avatar, and contact details.
- `ProfileTargetPreferences.tsx`: Target roles, target locations, salary threshold, and remote work preferences.
- `ProfileQualifications.tsx`: Core skills, keywords, certifications, education, and tools/software.
- `ProfileDocuments.tsx`: Dedicated document vault for CV and Cover Letter uploads with size and count quotas.
- `ScoringRulesEditor.tsx`: Match score weights and target domain preferences.

### 3. `JobsView.tsx` (Current: ~770 lines)

- **Issue**:
  Combines query search, multiple dropdown selectors, keyboard shortcuts (`j`/`k`/`Enter`), sorting heuristics,
  master-detail split layout toggles, and mobile drawer sheets.
- **Smell**:
  Tightly coupled filter state and layout management.
- **Solution**:
  - Extract `JobsFilterBar.tsx`: Encapsulates search, status pills, and dropdown selectors.
  - Extract `useJobsKeyboardNav.ts`: Custom hook managing keyboard navigation (`j`, `k`, `Enter`, `a`, `i`, etc.).

### 4. `JobDetailInspector.tsx` (Current: ~380 lines)

- **Issue**:
  Contains fallback heuristic generators for scoring tiers, domain labels, and formatting.
- **Solution**:
  Extract score presentation helpers into `src/lib/scoreFormatting.ts` to keep JSX purely presentational.

## Design System Primitives (`src/components/ui/`)

JobPulse uses a consistent hairline dark UI design system:

- `button.tsx`: Polymorphic button component with Radix Slot support and variant styles.
- `dialog.tsx`: Radix-based accessible modal overlay.
- `sheet.tsx`: Slide-over drawer inspector for mobile and responsive triage.
- `StatCard.tsx`: Metric presentation card with icon and delta badges.
- `StatusPill.tsx`: Color-coded pipeline badge for `new`, `applied`, `interviewing`, `interested`, `not_interested`.
- `CommandMenu.tsx`: Keyboard-driven command palette using `cmdk`.
- `BrandLogo.tsx`: SVG vector mark for JobPulse branding.
