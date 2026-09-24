# Release and Recovery Checklist

This is a release checklist for an invite-only product. It is not evidence that a production deployment or backup
schedule has been configured. The repository contains CI checks and manual database and Storage export scripts; it
contains no deployment workflow, scheduled offsite backup, production restore drill, or service-level objective.
Record links to those external systems here when they exist.

## Before inviting users

- **Identity:** Verify hosted Supabase Auth requires proof of email ownership before an invited email can access
  data. Test direct Auth API registration, not only the visible login form. Test removal of an invitation, email
  change, account deletion, and re-registration against personal records and document objects.
- **Migration preflight:** Before applying the UID-binding migration to hosted data, identify duplicate non-null
  `user_id` values in profiles and duplicate `(user_id, job_id)` pairs in statuses/evaluations; the new unique
  indexes intentionally reject these. Review unbound invitations and candidate rows with null `user_id`, and plan
  an owner-approved recovery for each. Inventory email-named avatar objects and migrate them to UID paths through
  the Storage API before deploying the private-bucket migration. Their old paths are denied by client RLS after
  migration. Audit any public URL caches from the earlier bucket mode.
- **Data access:** Run RLS and Storage policy tests as `anon`, an uninvited authenticated user, an invited user, and
  another invited user. Include direct Storage API uploads and concurrent attempts to exceed document quotas.
- **Privacy:** Confirm the production CSP and authorized origins (including Sentry ingestion domains if configured),
  production error reporter ([Error Tracking & Monitoring](ERROR_TRACKING_AND_MONITORING.md)), PII redaction, data
  retention, and user-data deletion procedure. Use publishable Supabase keys only in the frontend.
- **Scale:** Run the catalog-query and refresh-load tests described in [Performance and Scalability](PERFORMANCE_AND_SCALABILITY.md)
  against an agreed catalog size and peak concurrent session target. Record p95/p99 latency, error rate, and the
  observed delay before catalog changes appear in an open session.
- **Recovery:** Define recovery point and time objectives. Enable managed database recovery and encrypted,
  access-controlled offsite Storage copies with a retention schedule. Restore both into an isolated project, verify
  row and object counts plus access policies, and record the date and result.
- **Operations:** Name the owner, alert route (e.g. Sentry alerts, Slack/email notifications), and escalation path for
  Auth errors, database latency, Storage failures, browser errors, and deployment failures. Set a staged rollout and
  rollback decision threshold.

## Release procedure

1. Run `npm run check`; CI also runs coverage and applies/lints migrations in a disposable local database.
2. For schema changes, review the forward migration, regenerate database types, run a local reset, and inspect
   `supabase db diff --local --schema public` for local parity. `npm run db:diff` compares against the linked hosted
   project and requires separate review. Check data backfills and query plans on a representative staging dataset.
3. Capture a verified pre-release database and Storage restore point. Check that it is complete and accessible to
   the recovery owner. The local `make backup` command is a manual export to ignored `.backups/`; it is not a
   scheduled or offsite recovery system.
4. Apply the migration in staging and run Auth, RLS, Storage, list, overview, profile, and scoring smoke tests.
5. Release to a small invited cohort. Watch error rate, query latency, database CPU, refresh requests, and document
   upload failures before increasing invitations.
6. Record the deployed commit, migration version, time, operator, checks, and any deviations in a release log.

## If a release fails

- Stop increasing invitations or roll back the frontend build to the last known working artifact.
- Database migrations are forward-only. Do not edit an applied migration or assume a frontend rollback reverses a
  schema change. Prepare a corrective migration or restore an isolated copy to assess recovery impact first.
- If data restoration is required, use the documented recovery objectives and an approved production procedure.
  `make db-restore` resets **local** Supabase only; it must not be repurposed as a hosted restore command.
- Preserve a timeline of symptoms, affected users, mitigation, and follow-up actions. Verify reads, writes, Auth,
  and document access after recovery before reopening the rollout.

The scraper runs manually outside this repository and is not covered by this checklist. Its operational requirements
should be reviewed separately before depending on a continuous catalog-update rate.
