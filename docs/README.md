# JobPulse Technical Documentation

Welcome to the technical documentation for **JobPulse**, a production frontend and database system for
personalized opportunity discovery and candidate pipeline tracking.

## Documentation Index

1. [Architecture Overview](ARCHITECTURE.md)
   - High-level architecture, runtime topology, data flow, and Mermaid sequence diagrams.
2. [Component Breakdown](COMPONENTS.md)
   - UI hierarchy, component boundaries, props contracts, and recommendations for code simplification.
3. [Database Schema & Migrations](DATABASE_SCHEMA.md)
   - PostgreSQL schema, versioned migrations, server RPC functions, and entity-relationship models.
4. [Security & Multi-Tenancy](SECURITY_AND_MULTI_TENANCY.md)
   - Row-Level Security (RLS) enforcement, Supabase Storage isolation, tenant boundaries, and PII protection.
5. [Performance & Scalability](PERFORMANCE_AND_SCALABILITY.md)
   - Scaling to 100,000+ opportunities, server-side pagination, bundle optimization, and caching strategies.
6. [Engineering Standards & Conventions](STANDARDS_AND_CONVENTIONS.md)
   - TypeScript guidelines, TanStack Query conventions, Git lifecycle hooks, and automated verification gates.
7. [Quality, Accessibility & Compatibility](QUALITY_ACCESSIBILITY_AND_COMPATIBILITY.md)
   - Accessibility baseline, locale handling, browser support posture, performance safeguards, SEO stance, and
     release verification.

## Target Audience

These documents are designed for engineers, contributors, and technical leaders evaluating or developing
features on JobPulse. No prior expertise with the internal scoring mathematics or scraping ecosystem is required.
