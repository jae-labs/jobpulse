# Documentation index

This is the canonical, progressive-disclosure index for JobPulse documentation. Load the narrowest guide that
matches the change, then follow its links only when the work crosses a listed boundary. `AGENTS.md` is the
repository execution contract; this index records the maintained documentation topology.

| Guide | Use when | Owner / source of truth | Status |
| --- | --- | --- | --- |
| [Architecture](ARCHITECTURE.md) | Changing application boundaries, routing, Auth flow, or data topology | Application architecture | Current policy |
| [Components](COMPONENTS.md) | Adding or restructuring views, layouts, map, master-detail, or dashboard widgets | Frontend component topology | Current policy |
| [Design system](DESIGN_SYSTEM.md) | Integrating app UI with shared primitives or chart rendering rules | `packages/ui/DESIGN.md` is the detailed design authority | Current policy |
| [`packages/ui` design](../packages/ui/DESIGN.md) | Changing a reusable primitive, token, interaction treatment, Storybook state, accessibility gate or visual baseline | `packages/ui/` | Current policy |
| [`packages/ui` agent rules](../packages/ui/AGENTS.md) | Editing the UI package | `packages/ui/` execution boundary | Current policy |
| [Local development](LOCAL_DEVELOPMENT.md) | Starting local services, migrations, backups, restores, or scraper development | Local workflow and recovery procedures | Current policy |
| [Database schema](DATABASE_SCHEMA.md) | Changing schema, migrations, RPCs, triggers, generated models, or indexes | `supabase/migrations/` | Current policy |
| [Security and multi-tenancy](SECURITY_AND_MULTI_TENANCY.md) | Changing RLS, Storage, Auth, invitations, browser RPCs, or private data paths | Database authorization contract and tests | Current policy |
| [Regression prevention](REGRESSION_PREVENTION.md) | Removing code or changing matching, caching, telemetry, catalog, or failure behavior | Behavior-to-test matrix and cleanup contract | Current policy |
| [Scraper architecture](SCRAPER_ARCHITECTURE.md) | Changing extractors, provider adapters, pipeline behavior, or scoring ingestion | `services/scraper/` implementation | Current policy |
| [Scraper setup](../services/scraper/README.md) | Configuring scraper credentials or running scraper commands | `services/scraper/` operations | Current policy |
| [Standards and conventions](STANDARDS_AND_CONVENTIONS.md) | Reviewing TypeScript, queries, localization, lint, scraper conventions, or CI gates | Engineering standards; `.github/workflows/ci.yml` owns CI execution | Current policy |
| [Accessibility and compatibility](QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md) | Changing keyboard interaction, focus, motion, responsive behavior, or localization | Frontend quality contract | Current policy |
| [Performance and scalability](PERFORMANCE_AND_SCALABILITY.md) | Changing virtualization, charts, caching, rendering, workers, or query scale | Performance invariants | Current policy |
| [Error tracking and monitoring](ERROR_TRACKING_AND_MONITORING.md) | Changing diagnostics, Sentry, CSP, queue monitoring, or privacy-safe reporting | Telemetry and monitoring contract | Current policy |
| [Operations](OPERATIONS.md) | Running discovery, scraping/matching workflow, enrichment, catalog/location operations, or capacity probes | Operator runbook; Make targets wrap scraper CLIs | Current policy |
| [Release and recovery](RELEASE_AND_RECOVERY.md) | Preparing a release, recovery drill, hosted verification, or deployment evidence | Current release/recovery checklist | Current policy |

## Maintenance rules

Prefer updating the closest current guide over creating a parallel document. A new guide needs a distinct owner,
change trigger, and lifecycle; add it to this table in the same change. When consolidating or retiring a guide,
repair inbound links and update this index, `AGENTS.md`, and the root README together.

Guides explain the current what, where, how, and why. Follow the
[maintainer preferences](../AGENTS.md#maintainer-preferences): use present-tense contracts, technical sources,
and operational procedures. Keep editorial dates, personal attribution, approval narratives, past PR/commit
references, and development history out of maintained prose and comments. Preserve applied migrations,
behavioral tests, and valid private recovery snapshots. Review and update affected guides alongside code changes.

[`AGENTS.md` Required Verification](../AGENTS.md#required-verification) owns mandatory completion gates.
Other guides link there and explain check execution, domain contracts or operational steps. Compatibility
requirements and verified automation coverage must be stated separately; a target is not proof of coverage.

`npm run lint` validates links, heading anchors, package scripts, source paths and CI job declarations,
and requires every maintained guide to have complete trigger, owner and status metadata in this index.
Source paths in code spans/command blocks are repository-relative; use Markdown links for paths relative to
a guide. Brace/glob source references must match existing paths. Runtime `.env` files need not exist;
maintained `.env.example` files do. Explicit `npm run`/`pnpm run` commands are checked against root scripts
or a named `pnpm --filter` workspace package. The CI job/Name inventory is checked against the workflow,
including omitted jobs and changed display names. These checks validate references, not architecture,
security correctness, command outcomes or production readiness.

When commands, schema, component APIs, tokens, security boundaries or CI change, update the authoritative
guide in the same change and extend the closest maintained guide. Link important guardrails to their actual
lint, tests, authorization rules or CI checks. New guides cannot silently bypass progressive discovery.
