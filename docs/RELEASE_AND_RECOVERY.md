# Release & Recovery Checklist

Operational checklist for deploying and recovering JobPulse.

## Pre-Release Verification

- **Identity & Auth**: Verify hosted Supabase Auth requires confirmed email ownership. Confirm uninvited users are blocked by `is_authorized_user()`.
- **Database & RLS**:
  - Run `npm run db:diff` to ensure local migrations match linked production schema.
  - Verify all candidate tables enforce `user_id = auth.uid()` with RLS enabled.
- **Storage Policies**: Test that avatars and documents can only be accessed by their owning `auth.uid()`.
- **Pre-Release Snapshot**: Run `make backup` before applying schema migrations.
- **Automated Gate**: Confirm `npm run check` passes with zero errors on CI.

## Deployment Steps

1. **Create Forward Migration**: If modifying schema, create forward migration via `npm run db:migration <name>` and apply via `npm run db:push`.
   Account deletion requires the `purge_deleted_account_access` migration before the frontend action is exposed.
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
