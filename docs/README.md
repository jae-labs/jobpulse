# JobPulse Technical Documentation

Welcome to the technical documentation for **JobPulse**, a production frontend and database system for
personalized opportunity discovery and candidate pipeline tracking.

## Progressive Discovery Index

The documentation is organized in layers. Start with the high-level architecture or jump directly to the specific guide matching your task:

### 1. Architecture & Design System
- **[Architecture Overview](ARCHITECTURE.md)**: High-level architecture, runtime topology, data flow, query orchestration, and Mermaid sequence diagrams.
- **[Component Breakdown](COMPONENTS.md)**: UI hierarchy, component boundaries, master-detail layout, props contracts, and recommendations for code simplification.
- **[Design System](DESIGN_SYSTEM.md)**: Semantic visual tokens (`--ds-*`), reusable UI primitives, hairline dark styling, accessibility baseline, and extraction contract.

### 2. Data, Storage & Security
- **[Database Schema & Migrations](DATABASE_SCHEMA.md)**: PostgreSQL schema, versioned migrations, server RPC functions, and entity-relationship models.
- **[Security & Multi-Tenancy](SECURITY_AND_MULTI_TENANCY.md)**: Row-Level Security (RLS) enforcement, Supabase Storage isolation, tenant boundaries, Content Security Policy, and PII protection.

### 3. Engineering Standards, Quality & Performance
- **[Engineering Standards & Conventions](STANDARDS_AND_CONVENTIONS.md)**: TypeScript guidelines, TanStack Query conventions, Git lifecycle hooks, and automated verification gates.
- **[Quality, Accessibility & Compatibility](QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md)**: Accessibility baseline (WCAG 2.1 AA), keyboard cycling, locale handling (i18n/l10n), browser support posture, and release verification.
- **[Performance & Scalability](PERFORMANCE_AND_SCALABILITY.md)**: Current read path, TanStack Virtual tuning, unverified limits, and the benchmark plan for an invite-only rollout.

### 4. Operations, Observability & Delivery
- **[Local Development, Backups & Restore](LOCAL_DEVELOPMENT.md)**: Local Supabase workflow, Docker stack, migration parity, production backup, and Storage restore commands.
- **[Error Tracking & Monitoring](ERROR_TRACKING_AND_MONITORING.md)**: Error reporting architecture, Sentry enablement, CSP configuration, user context, and PII safeguards.
- **[Release and Recovery Checklist](RELEASE_AND_RECOVERY.md)**: Launch gates, staged rollout, backup and restore readiness, and incident response runbooks.

## Target Audience

These documents are designed for engineers, contributors, and technical leaders evaluating or developing
features on JobPulse. No prior expertise with the internal scoring mathematics or scraping ecosystem is required.
