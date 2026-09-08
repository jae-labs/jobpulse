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
</p>

JobPulse is a personal job search intelligence platform and customizable tracking dashboard.

It turns fragmented job hunting into a structured engineering workflow: aggregating scraped feeds, calculating
skill-match relevance scores, tracking opportunities via a keyboard-first master-detail view, and visualizing
recruitment funnel analytics across customizable dashboard widgets.

**Why JobPulse?**

- **Customizable Analytics Dashboard**: Reorderable bento analytics widgets with drag-and-drop layout persistence
  backed by `@dnd-kit` and local storage.
- **Keyboard-First Opportunity Pipeline**: Two-pane master-detail list with keyboard cycling (`j`/`k`), quick apply
  (`Enter`), and rapid status shortcuts (`a`/`i`/`o`/`n` for Applied, Interview, Offer, and Not Interested) with
  real-time Supabase synchronization.
- **Match Relevance Scoring**: Automatically scores incoming roles based on your skills, target domain,
  seniority, and minimum salary thresholds.
- **Employer Watchlist & Company Intelligence**: Monitor hiring signals, interview ratings, and culture notes
  for target organizations.
- **Sourcing Telemetry**: Real-time status and health telemetry across automated scrapers and job board ingestions.
- **Recruitment Funnel Analytics**: Interactive Recharts breakdown of pipeline velocity, skill frequency demand,
  and salary distributions.
- **Command Palette (`Cmd+K` / `Ctrl+K`)**: Keyboard-first navigation to quickly jump between views, search jobs,
  and execute actions.
- **High-Density Dark UI**: Linear-inspired hairline surfaces, crisp typography, and responsive drawer inspectors
  optimized for fast triage.

## Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Tailwind CSS 4 + Lucide React icons
- **Dashboard Layout & Reordering**: `@dnd-kit` (core & sortable)
- **Data & Auth**: Supabase (`@supabase/supabase-js`)
- **Visualizations**: Recharts
- **Command Menu**: `cmdk`
- **Linting & Type Safety**: Oxlint + TypeScript (`tsc`)
- **Tooling & Git Hooks**: Mise + Lefthook

## Quick Start

Requires Node.js `20.19.0` or newer (Node `22.12.0` recommended via `mise`).

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

4. **Configure environment:**

   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Populate your Supabase project credentials in `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

5. **Start local dev server:**

   ```bash
   npm run dev
   ```

   Open your browser at `http://localhost:5173`.

6. **Run local quality checks:**

   ```bash
   npm run check
   ```

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
│   │   ├── employers/           # Employer watchlist management
│   │   ├── jobs/                # Master-detail split, list view, and detail inspector
│   │   ├── profile/             # Candidate criteria and scoring weights
│   │   ├── sources/             # Job board scrapers and ingestion status
│   │   └── ui/                  # Reusable primitives (buttons, sheets, cmdk)
│   ├── lib/                     # Supabase client, storage, and profile utils
│   ├── types/                   # Domain TypeScript definitions (Job, Employer, etc.)
│   ├── App.tsx                  # Root application shell and view router
│   └── main.tsx                 # Entrypoint
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

## Contributing

See [CONTRIBUTING.md](https://github.com/jae-labs/template?tab=contributing-ov-file).

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
