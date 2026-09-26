# Security & Multi-Tenancy

JobPulse enforces strict tenant isolation and data protection across the database, storage, and API layers.

## 1. Identity & Access Control

- **Invite-Only Access**: Enforced via `authorized_users`. Unbound invitations are claimed on first login and bound to `auth.users.id`.
- **Authorization Guard**: Stored procedures and policies verify `public.is_authorized_user()`, requiring a confirmed Auth account and bound invite.
- **Unauthenticated Blocking**: `anon` access to private tables and catalog RPCs is revoked.
- **Error Masking & Information Leakage Prevention**: Access checks filter strictly by authenticated identity (`auth.uid()` or validated session email) to avoid multi-row collisions (PGRST116), and the UI displays sanitized, localized copy (`AccessDeniedView`) rather than exposing internal database error messages, schema names, or table keys.

## 2. Row-Level Security (RLS)

All candidate tables enforce strict tenant isolation using PostgreSQL RLS:

- **Tables**: `user_profiles`, `user_job_statuses`, `user_job_evaluations`, `user_cvs`, `user_cover_letters`.
- **Ownership**: Every candidate row requires `user_id = auth.uid()`. Legacy `user_email` columns have been dropped.
- **Write Triggers**: Database triggers automatically enforce `user_id = auth.uid()` from the active session on all writes.

## 3. Storage Security (Documents & Avatars)

- **`user-documents` Bucket**:
  - Private bucket; 10 MB per-file limit with allowed MIME types.
  - Storage paths are prefixed with `${auth.uid()}/`.
  - Object access requires an existing metadata row in `user_cvs` or `user_cover_letters` owned by `auth.uid()`.
  - Downloads use short-lived signed URLs (60-second TTL) with `Content-Disposition: attachment` to stream directly to disk without browser memory buffering.
- **`avatars` Bucket**:
  - Private bucket; 2 MB per-file limit.
  - Avatars use UID-prefixed paths (`${auth.uid()}/avatar`) with short-lived signed display URLs (15-minute TTL).

## 4. Browser & Network Hardening

- **Headers**: `public/_headers` sets `nosniff`, frame denial (`DENY`), strict referrer policy, and Content Security Policy (CSP).
- **CSP Allowlist**: Restricts `connect-src` to same-origin, configured Supabase endpoints, and Sentry ingestion domains.
- **Credential Hygiene**: The client uses only publishable `VITE_SUPABASE_*` keys. Service-role keys are never bundled.
- **PII Protection**: Error reporting redacts authorization headers, API keys, and candidate personal data.

## 5. Self-Service Account Deletion

- `delete-account` is an authenticated Edge Function. It verifies the caller's JWT with Auth and uses that
  identity as the only deletion target; a request cannot choose another UUID.
- The service role key stays in the function runtime. Storage objects are removed through the Storage API
  before `auth.admin.deleteUser()` deletes the Auth user and cascades candidate records.
- A database trigger removes the access row and pending invitations issued by that user. A client confirmation
  requires the account email, and the UI signs out only after successful deletion.
- This removes live application data. Existing backup snapshots and provider logs have separate retention
  and are not erased by the account-deletion request.
