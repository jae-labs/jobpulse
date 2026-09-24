# Security and Multi-Tenancy

JobPulse stores candidate profiles, application status, resumes, and cover letters. The database and private Storage
bucket enforce access for an invite-only product. The latest forward migrations are
`20260924000001_bind_invites_and_documents_to_user_ids.sql`, `20260924000002_harden_candidate_writes_search_and_avatars.sql`,
and `20260924000003_remove_email_avatar_ownership.sql`; run a local migration reset and direct API policy tests
before applying them to a hosted project.

## Identity and invitations

- `authorized_users` is the invitation list. A confirmed Supabase Auth email claims an unbound invitation; the
  invitation is then bound to that account's immutable `auth.users.id` in `authorized_users.user_id`.
- `is_authorized_user()` requires the bound ID and a confirmed email. Changing or re-registering an email does not
  transfer an already-bound invitation. An administrator must explicitly review any invitation transfer.
- The visible login form is not the security boundary. Verify hosted Auth email-confirmation settings and test
  direct Auth API calls. Local development settings alone do not establish hosted behavior.
- `anon` cannot read private tables or execute the catalog RPCs. Authorized users can read the shared jobs and
  sources catalogs.

## Candidate rows

`user_profiles`, `user_job_statuses`, `user_job_evaluations`, `user_cvs`, and `user_cover_letters` use the caller's
`auth.uid()` as the owner for candidate reads. Write policies also require the authenticated owner. Existing rows with a null
`user_id` remain in the database for reviewed recovery, but they are not readable through an email fallback. Backfill
legacy rows only after checking the original owner; assigning them by current email alone could expose another
person's data after address reassignment.
On authenticated candidate writes, a database trigger sets both `user_id` and the legacy `user_email` from the
current Auth account. Client-supplied email values cannot reserve another user's unique profile email.

Server RPCs validate the authorized caller. The frontend sends an email for compatibility with their current
signatures, but a caller cannot use that parameter to read another candidate's records.

## Documents and avatars

- `user-documents` is private and caps each object at 10 MB with an allowed MIME list. A document metadata row
  reserves its exact `storage_path` before upload. Storage SELECT, UPDATE, and DELETE require a metadata row owned
  by `auth.uid()` for that exact path. INSERT also requires the first path segment to be that UID. Email-prefixed
  legacy objects cannot be uploaded anew, and an object without owned metadata cannot be read through the client.
- Database triggers serialize reservations per user and enforce a maximum of ten CV metadata rows and ten cover
  letter metadata rows. Failed uploads must remove their reservations; operational cleanup should also detect stale
  reservations and orphaned Storage objects.
- Avatars use a separate private bucket. The browser stores a UID-prefixed object path and requests a signed URL
  with a 15-minute lifetime for display. Email-prefixed legacy objects cannot be read through client RLS; migrate
  or remove them with an owner-reviewed Storage API operation. Previously issued public URLs may remain in caches
  until they expire, so treat the bucket transition as a privacy migration rather than immediate revocation of
  every cached copy.

## Browser and repository controls

`public/_headers` sets `nosniff`, frame denial, a referrer policy, a permissions policy, and a Content Security
Policy. The source header and `index.html` allow same-origin connections and images by default. The build adds the
configured Supabase HTTP(S) origin to `connect-src` and `img-src`, and its matching WS(S) origin to `connect-src`.
Check the built artifacts and test Auth, PostgREST, and Storage against the deployed policy. The current frontend
does not open a Realtime catalog subscription.

Never commit service-role credentials, personal data, or `.backups/`. The frontend uses only publishable
`VITE_SUPABASE_*` credentials. The pre-commit hook runs `gitleaks` on staged changes. Local backups can contain
personal data and are not a replacement for encrypted offsite recovery; see [Release and Recovery](RELEASE_AND_RECOVERY.md).
