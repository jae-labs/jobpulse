# Release & Recovery Checklist

Operational checklist for deploying and recovering JobPulse.

## Pre-Release Verification

- **Identity & Auth**: Verify hosted Supabase Auth requires confirmed email ownership. Confirm uninvited users are blocked by `is_authorized_user()`.
- **Database & RLS**:
  - Run `npm run db:diff` to ensure local migrations match linked production schema.
  - Verify all candidate tables enforce `user_id = auth.uid()` with RLS enabled.
- **Storage Policies**: Test that avatars and documents can only be accessed by their owning `auth.uid()`.
- **Pre-Release Snapshot**: Run `make backup` before applying schema migrations.
- **Automated Gate**: Confirm `npm run check` and `npm run db:test:tenancy` pass with zero errors.
  Require the **Tenant Isolation Guardrails** CI status in the `main` ruleset; a red tenant suite blocks release.
- **Native Scoring**: Confirm the pinned browser model assets are included in `dist/`, run `make scrape-backfill` for any existing jobs without vectors, and verify profile onboarding, a weight edit, and a dealbreaker against the hosted database.

## Deployment Steps

1. **Create Forward Migration**: If modifying schema, create a migration via `npm run db:migration <name>` and apply via `npm run db:push`.
2. **Update Types**: Regenerate database types via `npm run db:types`.
3. **Verify Build**: Run `npm run check` to ensure clean typecheck, lint, tests, and bundle build.
4. **Deploy Function**: Run `supabase functions deploy delete-account` against the linked project. Keep JWT
   verification enabled and verify that `SUPABASE_SERVICE_ROLE_KEY` is available only in the function runtime.
5. **Deploy Frontend**: Deploy the production Vite build (`dist/`) to hosting platform (e.g. Cloudflare Pages).
6. **Post-Deploy Smoke Test**: Verify login, catalog browsing, status transitions, profile update, document
   downloads, and account deletion on a disposable test account with an avatar and document.

## Rollback & Recovery Runbook

- **Frontend Issue**: Revert to previous static deployment artifact immediately.
- **Database Schema Issue**:
  - Migrations are forward-only. Do not edit applied migrations.
  - Deploy a corrective forward migration to resolve issues.
- **Data Recovery**:
  - Use `make backup` snapshots stored in `.backups/` for local disaster triage.
  - Hosted restore must be conducted through Supabase Dashboard or point-in-time recovery (PITR).

## Durable matching operations

`candidate_scoring_work` and `scoring_catalog_generation` are backend-only tables. Browser roles can read their own sanitized progress via `get_profile_embedding_state`; only service workers can call `process_candidate_scoring(100)` or its scheduler. The scheduler performs at most 50 slices per tick and stops after five seconds; an eight-second statement timeout protects the cron call. A failed user's batch rolls back, stores SQLSTATE only, and schedules backoff. Repairing matching inputs or requesting a retry keeps the same profile vector when its content is unchanged. Weight-only edits recompose cached factors without a full rescore.

Check queue age, failures and cron activity after deployment. Alert on oldest pending work over five minutes, repeated failures, a cron worker failure, or missing model/vector coverage. A five-minute freshness target is an operational target, not a certified capacity claim for 1,000 simultaneous profile edits. Do not raise worker concurrency until catalog requests retain their latency budget. Use a service worker pool with `SKIP LOCKED` for additional throughput; never put privileged credentials in the frontend.

The repository's `main` protection now requires Tenant Isolation Guardrails, Supabase Migration Lint, Code Quality & Build Check and Scraper Quality & Tests, enforces administrators, requires one review and stale-approval dismissal, and prevents branch deletion/force pushes. Code-owner review is enabled. All production fixes still need the reviewed commit deployed to the frontend; applying SQL migrations alone does not deploy browser changes.
