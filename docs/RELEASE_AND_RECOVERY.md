# Release & Recovery Checklist

Operational checklist for deploying and recovering JobPulse.

## Pre-Release Verification

- **Identity & Auth**: Verify hosted Supabase Auth requires confirmed email ownership. Confirm uninvited users are blocked by `is_authorized_user()`.
- **Database & RLS**:
  - Run `npm run db:diff` to ensure local migrations match linked production schema.
  - Verify all candidate tables enforce `user_id = auth.uid()` with RLS enabled.
- **Storage Policies**: Test that avatars and documents can only be accessed by their owning `auth.uid()`.
  Run `supabase functions serve delete-account` and `npm run db:test:account-deletion`
  against a local stack. The test creates and cleans up two random synthetic users,
  verifies forged target denial and foreign-file survival, races avatar uploads with
  deletion, checks retry cleanup, and verifies that the deleted session loses access.
  CI runs this alongside the tenant gate. Repeat a controlled equivalent on an
  explicitly approved hosted test environment before release.
- **Pre-Release Snapshot**: Run `make backup` before applying schema migrations.
- **Automated Gate**: Confirm `npm run check` and `npm run db:test:tenancy` pass with zero errors.
  Require the **Tenant Isolation Guardrails** CI status in the `main` ruleset; a red tenant suite blocks release.
- **Regression Contract**: Identify affected findings in [Regression Prevention](REGRESSION_PREVENTION.md),
  run their behavioral tests, and verify the integration checks that mocks/SQL cannot cover.
- **Native Scoring**: Confirm the pinned browser model assets are included in `dist/`, run `make scrape-backfill` for any existing jobs without vectors, and verify profile onboarding, a weight edit, and a dealbreaker against the hosted database.

## Deployment Steps

1. **Verify Locally**: Create any forward migration via `npm run db:migration <name>`.
   Verify the complete chain on a disposable local database, regenerate both language
   models with `npm run db:types`, and run `make check`, `npm run db:test` and
   `npm run build-storybook`. Pending versions on a developer database use
   `supabase migration up --local`; do not reset it automatically.
2. **Prepare the Release**: Pass required PR checks/review. Record the intended commit,
   migration versions, compatibility with the currently deployed frontend and rollback artifact.
   A SQL migration and a frontend release are separate deployments.
3. **Apply Schema**: Verify a fresh complete database/Storage snapshot before pushing
   schema changes to the intended linked project via `npm run db:push`. Inspect
   `npm run db:diff` and the hosted ledger after application.
4. **Deploy Changed Functions**: When the function changed, run `supabase functions deploy delete-account` against the linked project. Keep JWT
   verification enabled and verify that `SUPABASE_SERVICE_ROLE_KEY` is available only in the function runtime.
5. **Deploy Frontend**: Deploy the reviewed production commit through the configured
   Cloudflare Pages production branch. Verify the successful deployment's commit;
   a local build or applied migration does not establish that browser fixes are live.
6. **Post-Deploy Smoke Test**: With two separate disposable authorized accounts,
   verify login, search/filter/sort, overview coverage, status/detail freshness,
   profile update/retry, account switching, export and private document access.
   Verify account deletion with an avatar and document. After an inference/runtime
   upgrade, check finite 384-dimensional output under production CSP and observe
   cold download, warm inference and worker responsiveness separately.

Cloudflare Rocket Loader must not rewrite the application module entrypoint.
Keep `data-cfasync="false"` on its script tag and verify the deployed HTML retains
`type="module"`. If the custom domain shows a blank page while the Pages origin
loads, inspect edge script transformations before changing database or CSP rules.
Also verify module assets return JavaScript, including browser cache variants.
An HTML SPA fallback cached at a hashed asset URL prevents startup; purge the
affected JobPulse hostname cache and verify browser loading after recovery.

## Rollback & Recovery Runbook

- **Frontend Issue**: Revert to previous static deployment artifact immediately.
- **Database Schema Issue**:
  - Migrations are forward-only. Do not edit applied migrations.
  - Deploy a corrective forward migration to resolve issues.
- **Data Recovery**:
  - Use `make backup` snapshots stored in `.backups/` for local disaster triage.
  - Hosted restore must be conducted through Supabase Dashboard or point-in-time recovery (PITR).
  - Rehearse a representative database plus Storage restore in isolation; verify rows,
    documents and ownership, and record measured recovery time. Checksums alone do
    not establish a usable restore.

## Durable matching operations

`candidate_scoring_work` and `scoring_catalog_generation` are backend-only tables. Browser roles can read their own sanitized progress via `get_profile_embedding_state`; only service workers can call `process_candidate_scoring(100)` or its scheduler. The scheduler performs at most 50 slices per tick and stops after five seconds; an eight-second statement timeout protects the cron call. A failed user's batch rolls back, stores SQLSTATE only, and schedules backoff. Repairing matching inputs or requesting a retry keeps the same profile vector when its content is unchanged. Weight-only edits recompose cached factors without a full rescore.

Check queue age, failures and cron activity after deployment. Alert on oldest pending work over five minutes, repeated failures, a cron worker failure, or missing model/vector coverage. A five-minute freshness target is an operational target, not a certified capacity claim for 1,000 simultaneous profile edits. Do not raise worker concurrency until catalog requests retain their latency budget. Use a service worker pool with `SKIP LOCKED` for additional throughput; never put privileged credentials in the frontend.

The release policy requires `main` protection with Tenant Isolation Guardrails, Supabase Migration Lint, Code Quality & Build Check and Scraper Quality & Tests, administrator enforcement, pull requests, resolved discussions, an up-to-date branch, and prevention of branch deletion/force pushes. The confirmed solo-maintainer workflow requires zero independent approvals; introduce one approval and code-owner review when a second maintainer joins. Verify the live protection settings before release. All production fixes still need the reviewed commit deployed to the frontend; applying SQL migrations alone does not deploy browser changes. The concrete settings proposal is in [Production Release Actions](PRODUCTION_RELEASE_ACTIONS.md).

## Operational evidence before wider rollout

- Configure and test actual alert delivery for queue age/failure, ingestion failure
  and frontend errors. Writing an alert threshold in a document does not configure it.
- Verify provider access and retention for Supabase, Cloudflare and Sentry against
  the one-year ceiling, including historical telemetry/backups and incomplete exports.
- Keep recovery drill results and a hosted load test with realistic read concurrency
  alongside scoring. The [local capacity probe](OPERATIONS.md#historical-local-capacity-evidence) is limited
  SQL evidence; it does not certify 1,000 hosted users or simultaneous profile edits.
- Before offering password login, verify leaked-password protection or disable the
  unused provider after checking its effects. Recheck hosted settings rather than
  assuming a migration established provider account configuration.

Keep dated remediation records as history. Current production status comes from
deployment commits, migration ledgers, live smoke tests and operational evidence.
