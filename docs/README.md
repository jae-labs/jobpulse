# Documentation index

This is the canonical, progressive-disclosure index for JobPulse documentation. Load the narrowest guide that
matches the change, then follow its links only when the work crosses a listed boundary. `AGENTS.md` is the
repository execution contract; this index records the maintained documentation topology.

| Guide | Use when | Owner / source of truth | Status |
| --- | --- | --- | --- |
| [Architecture](ARCHITECTURE.md) | Changing application boundaries, routing, Auth flow, or data topology | Application architecture | Current policy |
| [Components](COMPONENTS.md) | Adding or restructuring views, layouts, map, master-detail, or dashboard widgets | Frontend component topology | Current policy |
| [Design system](DESIGN_SYSTEM.md) | Integrating app UI with shared primitives or chart rendering rules | `packages/ui/DESIGN.md` is the detailed design authority | Current policy |
| [`packages/ui` design](../packages/ui/DESIGN.md) | Changing a reusable primitive, token, interaction treatment, or Storybook state | `packages/ui/` | Current policy |
| [`packages/ui` agent rules](../packages/ui/AGENTS.md) | Editing the UI package | `packages/ui/` execution boundary | Current policy |
| [Local development](LOCAL_DEVELOPMENT.md) | Starting local services, migrations, backups, restores, or scraper development | Local workflow and recovery procedures | Current policy |
| [Database schema](DATABASE_SCHEMA.md) | Changing schema, migrations, RPCs, triggers, generated models, or indexes | `supabase/migrations/` | Current policy |
| [Security and multi-tenancy](SECURITY_AND_MULTI_TENANCY.md) | Changing RLS, Storage, Auth, invitations, browser RPCs, or private data paths | Database authorization contract and tests | Current policy |
| [Regression prevention](REGRESSION_PREVENTION.md) | Removing code or changing matching, caching, telemetry, catalog, or failure behavior | Failure-to-test matrix and cleanup contract | Current policy |
| [Scraper architecture](SCRAPER_ARCHITECTURE.md) | Changing extractors, provider adapters, pipeline behavior, or scoring ingestion | `services/scraper/` implementation | Current policy |
| [Scraper setup](../services/scraper/README.md) | Configuring scraper credentials or running scraper commands | `services/scraper/` operations | Current policy |
| [Standards and conventions](STANDARDS_AND_CONVENTIONS.md) | Reviewing TypeScript, queries, localization, lint, scraper conventions, or CI gates | Engineering standards; `.github/workflows/ci.yml` owns CI execution | Current policy |
| [Accessibility and compatibility](QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md) | Changing keyboard interaction, focus, motion, responsive behavior, or localization | Frontend quality contract | Current policy |
| [Performance and scalability](PERFORMANCE_AND_SCALABILITY.md) | Changing virtualization, charts, caching, rendering, workers, or query scale | Performance invariants | Current policy |
| [Error tracking and monitoring](ERROR_TRACKING_AND_MONITORING.md) | Changing diagnostics, Sentry, CSP, queue monitoring, or privacy-safe reporting | Telemetry and monitoring contract | Current policy |
| [Operations](OPERATIONS.md) | Running discovery, scraping/matching workflow, enrichment, catalog/location operations, or historical capacity probes | Operator runbook; Make targets wrap scraper CLIs | Current policy with historical evidence |
| [Release and recovery](RELEASE_AND_RECOVERY.md) | Preparing a release, recovery drill, hosted verification, or deployment evidence | Current release/recovery checklist | Current policy |
| [Production readiness — 3 October 2026](PRODUCTION_READINESS.md) | Investigating the October 2026 remediation or its evidence | Dated remediation record; not deployment certification | Historical evidence |
| [Production release actions — 3 October 2026](PRODUCTION_RELEASE_ACTIONS.md) | Investigating actions approved during that remediation | Dated action record; not a current runbook | Historical evidence |

## Maintenance rules

Prefer updating the closest current guide over creating a parallel document. A new guide needs a distinct owner,
change trigger, and lifecycle; add it to this table in the same change. When consolidating or retiring a guide,
repair inbound links and update this index, `AGENTS.md`, and the root README together. Preserve applied-migration,
security, recovery, and incident evidence, but label it historical instead of duplicating it in current policy.

`npm run lint` validates local Markdown links and heading anchors, and requires every maintained guide to have complete trigger, owner and status metadata in this index. New guides cannot silently bypass progressive discovery.
