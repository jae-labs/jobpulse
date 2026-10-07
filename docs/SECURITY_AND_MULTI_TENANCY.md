# Security & Multi-Tenancy

JobPulse enforces strict tenant isolation and data protection across the database, storage, and API layers.

## 1. Identity & Access Control

- **Invite-Only Access**: Enforced via `authorized_users`. Unbound invitations are claimed on first login and bound to `auth.users.id`.
- **Authorization Guard**: Stored procedures and policies verify `public.is_authorized_user()`, requiring a confirmed Auth account and bound invite.
- **Unauthenticated Blocking**: `anon` access to private tables and catalog RPCs is revoked.
- **Error Masking & Information Leakage Prevention**: Access checks filter strictly by authenticated identity (`auth.uid()` and the authenticated session UUID) to avoid multi-row collisions (PGRST116), and the UI displays sanitized, localized copy (`AccessDeniedView`) rather than exposing internal database error messages, schema names, or table keys.

## 2. Row-Level Security (RLS)

The invitation directory exposes only the current account authorization row and invitations issued by that account. Recovering a pending code or deleting an invitation also checks issuer ownership; membership alone grants neither operation.

All candidate tables enforce strict tenant isolation using PostgreSQL RLS:

- **Tables**: `user_profiles`, `user_job_statuses`, `user_job_evaluations`, `user_cvs`, `user_cover_letters`.
- **Ownership**: Every candidate row requires `user_id = auth.uid()`. Ownership is keyed by the verified Auth UUID.
- **Scoring Isolation**: Candidate scores, explanations, and profile-dependent classifications exist only in `user_job_evaluations`; shared `jobs` rows never contain candidate analysis. RPCs and browser queries return an unassessed result when the current user has no evaluation. Embedding tables remain unreadable to browser roles. Authenticated users submit only their own profile vector through `save_profile_embedding_guarded`, which validates the current profile snapshot, and `rescore_user` checks the caller UUID.
- **Write Triggers**: Browser writes reject a supplied foreign owner and default an omitted owner to the verified `auth.uid()`. Service-role writes retain an explicit non-null owner.

## 3. Storage Security (Documents & Avatars)

- **`user-documents` Bucket**:
  - Private bucket; 10 MB per-file limit with allowed MIME types.
  - Storage paths are prefixed with `${auth.uid()}/`.
  - Object access requires an existing metadata row in `user_cvs` or `user_cover_letters` owned by `auth.uid()`.
  - Document download/deletion APIs require a specific numeric document ID and scope metadata queries to the authenticated UUID.
  - Object deletion precedes metadata deletion because Storage policies depend on that metadata; a Storage failure retains the record.
  - Downloads use short-lived signed URLs (60-second TTL) with `Content-Disposition: attachment` to stream directly to disk without browser memory buffering.
- **`avatars` Bucket**:
  - Private bucket; 2 MB per-file limit.
  - Avatars use UID-prefixed paths (`${auth.uid()}/avatar`) with short-lived signed display URLs (15-minute TTL).

## 4. Browser & Network Hardening

- **Headers**: `public/_headers` sets `nosniff`, frame denial (`DENY`), strict referrer policy, and Content Security Policy (CSP).
- **CSP Allowlist**: Restricts `connect-src` to same-origin, configured Supabase endpoints, and Sentry ingestion domains.
- **Credential Hygiene**: The client uses only publishable `VITE_SUPABASE_*` keys. Service-role keys are never bundled.
- **PII Protection**: Error reporting is explicitly configured by deployment and disabled by default in development. The event allowlist keeps generic error types and static bundle locations only; it drops user IDs, messages, request data, arbitrary scope/context, breadcrumbs and URLs. SDK v11 data collection is disabled for personal fields, headers, bodies, query parameters, and local variables; tracing and replay are off. Invitation parameters are cleared before telemetry initializes.

## 5. Self-Service Account Deletion

- `delete-account` is an authenticated Edge Function. It verifies the caller's JWT with Auth and uses that
  identity as the only deletion target; a request cannot choose another UUID.
- The service role key stays in the function runtime. Storage objects are removed through the Storage API
  before `auth.admin.deleteUser()` deletes the Auth user and cascades candidate records.
- A database trigger removes the access row and pending invitations issued by that user. A client confirmation
  requires the account email, and the UI signs out only after successful deletion.
- This removes live application data. Existing backup snapshots and provider logs have separate retention
  and are not erased by the account-deletion request.

## 6. Tenant Regression Guardrails

RLS is the enforcement boundary. Lint, hooks, and agent instructions are additional
checks; they cannot prove isolation on their own.

The [behavior-to-test matrix](REGRESSION_PREVENTION.md) specifies privacy,
matching and query contracts alongside the tenant contract. Review it when adding
private fields, asynchronous work or diagnostic integrations.

| Layer | Gate | What it catches |
| --- | --- | --- |
| Browser source | `npm run test:tenant-lint` (also included in `lint`) | New browser Supabase clients, privileged credential references/Admin APIs, unsafe query keys/placeholders, Sentry imports outside the privacy boundary, direct console diagnostics |
| Browser cache/session | `npm run test` | Cache key collisions between two users, unclassified new factories, logout/account-switch cache retention, stale asynchronous session restoration |
| Database inventory | `tenant_catalog.sql` | Unclassified public relations/RPC exposure, disabled RLS, missing owner columns, browser vector access, anonymous RPC grants, missing definer search paths, writable public schema, public/unclassified Storage buckets |
| Database requests | `tenant_rows.sql`, `tenant_invitations.sql` | Two-member read/write separation, ownership spoofing, Storage metadata isolation, candidate fields returned by jobs/overview RPCs, foreign rescoring, anonymous/uninvited/unconfirmed access, foreign invitation reads/code retrieval/deletion |
| Guard self-tests | `tenant_mutations.sql` | Intentionally disables RLS, widens a policy, exposes a privileged RPC, grants anonymous execution, creates an unknown table, and makes documents public; the guards must reject each change |
| Durable work | `tenant_scoring_queue.sql` | Invalid matching inputs/vectors, lost setup/retry state, ingestion fan-out, shortlist underfill, weight-edit rescoring, worker exposure and failed-tenant interference |
| Catalog retention | `tenant_catalog_retention.sql` | The service-only pruning RPC cannot delete a vacancy based on age alone |

The public-table and browser-RPC inventory lives in
`supabase/tests/helpers/tenant_contract.sql`. A new owner table must also have a
synthetic fixture: the read/write matrix automatically includes every owner table
in the inventory and requires a visible owner row. New views are blocked until the
contract is deliberately extended with an invoker-safe design and negative tests.
Adding a function to the browser inventory also requires behavioral tests for its
private data paths; an inventory entry is not an authorization check.

All tenant suites run inside transactions that roll back, including when a query
fails. Their synthetic accounts do not rely on the development admin being the only
user. They run row operations as `authenticated` or `anon`, never as a privileged
service client. A supplied write owner must match the verified caller. Mismatched ownership is
rejected before persistence; stale requests must never be rewritten into a new account. Unfiltered UPDATE/DELETE
probes and INSERT probes without RETURNING prevent SELECT policies from masking
unsafe write policies. Storage SQL probes exercise
RLS on object metadata, using the Storage API deletion flag without bypassing RLS.
They do not upload/download real files or replace end-to-end Storage API tests.

### Local commands

Follow the [required verification contract](../AGENTS.md#required-verification) for completion and
conditional database gates. To diagnose the tenant database gate locally:

```bash
npm run db:start
npm run db:test:tenancy
```

`npm run db:test` runs every top-level SQL suite, including non-tenant behavior tests.

The database runner uses the local Supabase Docker container named from
`supabase/config.toml`; it accepts no database URL, hosted credentials, or reset
flag, and requires a local Docker socket/pipe. It fails when the migration ledger differs from the checkout, so an older
schema cannot produce a misleading green result. It never resets, restores, or
applies migrations automatically. Apply pending forward versions with
`supabase migration up --local`. A divergent history needs reconciliation; reset only
a disposable database or a deliberately backed-up developer database. Existing non-tenant SQL suites also require the
development seed.

Lefthook runs source lint and jsdom/Node tests at pre-commit through `lint` and `test`, and requires
`db:test:tenancy` at pre-push. Install hooks with `npm run prepare`. A stopped or
stale local database fails the push gate. Do not bypass it to ship a feature.

### CI and publishing

The tenant job in the [CI gate inventory](STANDARDS_AND_CONVENTIONS.md#ci-gates) runs on pushes and PRs
to `main`, including frontend-only changes, against a clean database with every migration applied. The
same job auto-discovers all top-level `supabase/tests/*.sql`, so adding a suite
does not require editing a hardcoded CI file list.

Direct pushes and history rewriting follow [maintainer preferences](../AGENTS.md#maintainer-preferences);
pull requests are optional. Complete the [required verification contract](../AGENTS.md#required-verification)
before publishing and verify all jobs in the [CI gate inventory](STANDARDS_AND_CONVENTIONS.md#ci-gates).
Migration lint and generated-type parity execute inside the tenant job.
Hooks can be skipped locally; the workflow does not configure GitHub branch protection.
Do not claim enforcement from workflow configuration alone.

Existing failures are release blockers. Do not grandfather a known leak into the
inventory, delete a negative test, or turn a denied request into an accepted one to
make the gate green. Fix the policy/RPC with a forward migration and retain the
regression test. These controls cover the declared access contract; new Edge
Functions, service-role paths, and Storage API behavior require corresponding
identity-forgery/integration tests and review.
