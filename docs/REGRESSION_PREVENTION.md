# Regression prevention and safe cleanup

The October 2026 review exposed failures in ownership, asynchronous state, scoring,
query contracts and privacy. These are continuing engineering requirements, not
temporary cleanup tasks. New features must preserve the contracts below.

Instructions and static lint cannot guarantee security. PostgreSQL grants, RLS and
caller checks enforce access; role-based negative tests prove the declared behavior.
Hooks provide local feedback, and required CI checks protect merges. A new data path
needs its own behavioral tests even when every existing check passes.

## Failure-to-test matrix

Finding IDs identify the continuing failure contracts below.
Test paths in this table are relative to the repository root. SQL suites live under
`supabase/tests/` and run with `npm run db:test`; tenant suites also run at pre-push.

| Finding | Contract future changes must preserve | Regression evidence |
| --- | --- | --- |
| F1: pagination CTE outage | Count and page share a SQL statement and filter population; empty/high-offset pages retain totals; sorts have stable ID tie breaks | `jobs_pagination.sql` |
| F2: invitation access crossed tenants | Own access row and issuer-owned invitations only; foreign IDs/codes cannot authorize reads or deletion; pending invitations are bounded | `tenant_catalog.sql`, `tenant_rows.sql`, `tenant_invitations.sql` |
| F3: malformed input interrupted shared work | Validate JSON shape, size, lists, numbers and vectors at the database boundary; roll back only the failing tenant's slice | `tenant_scoring_queue.sql` |
| F4: telemetry could collect private data | Use the explicit-DSN diagnostic allowlist; drop identity, free text, request data, breadcrumbs, tracing and replay; consume invitation parameters first | `src/lib/sentry.test.ts`, `src/lib/logger.test.ts`, `src/components/auth/LoginView.test.tsx`, source lint |
| F5: browser and SQL filters disagreed | Keep status/salary/sort enums aligned; use annual EUR thresholds and bounded literal search/location input | `jobs_pagination.sql`, `salary_normalization.sql`, `src/components/jobs/JobsView.test.tsx` |
| F6: ingestion multiplied work by users | Advance one generation per vector statement; enqueue profile/vector changes atomically; process bounded durable slices outside request/write paths | `tenant_scoring_queue.sql`; [capacity probe](OPERATIONS.md#historical-local-capacity-evidence) |
| F7: approximate ranking underfilled results | Exact stable shortlist of up to 1,500 eligible vectors; trim native results only after completion | `tenant_scoring_queue.sql` with 1,601-vector fixture |
| F8: save/retry lost unfinished work | Persist awaiting-embedding state; retain usable old results; failed current-vector work retries; check UID and profile hash after inference | `tenant_scoring_queue.sql`, `src/lib/userProfile.test.ts` |
| F9: loaded-page counters misled users | Server catalog supplies shared domains and facets; map counts cover the filtered catalog independently of loaded pages | `overview_metrics.sql`, `src/components/jobs/JobsView.test.tsx` |
| F10: unassessed jobs appeared as poor matches | Match statistics use assessed jobs; categories include Uncategorized; chart labels name the population | `overview_metrics.sql`, `src/components/dashboard/OverviewView.test.tsx` |
| F11: private/stale detail survived state changes | Central owner-scoped keys, before/after identity checks, account remount, complete invalidation and bounded freshness polling | `src/lib/queryKeys.test.ts`, `src/hooks/useTenantSwitch.test.tsx`, `src/hooks/useAuthSession.isolation.test.ts`, `src/hooks/useQueries.test.ts` |
| F12: search hid failures | Debounce/cap input; use authoritative server results; show loading/error/retry/empty states; suppress stale results on failure | `src/components/ui/CommandMenu.states.test.tsx` |
| F13: source outages triggered deletion | Missing/old data is not evidence of closure; never run age-only pruning; preserve candidate tracking during deduplication | `tenant_catalog_retention.sql`, `services/scraper/tests/test_pipeline_ingestion.py`, `services/scraper/tests/test_cli_safety.py`, `services/scraper/tests/test_repository_safety.py`, `candidate_statuses.sql` |
| F14: inference dependency advisories | Locked dependency audits, checksum-pinned same-origin assets and bounded browser workers; verify the production CSP after upgrades | CI audits, `scripts/prepare-browser-model.mjs`, release browser inference smoke test |
| Camera updates blanked dots or retained results across filter/identity changes | Keep GPU points during same-scope pending requests, clear on errors or scope changes, and restore layers after style reload | `src/components/jobs/JobsMapCanvas.test.tsx`, `src/lib/cspHeaders.test.ts` |
| Company offices: directory evidence must remain separate from job workplace facts | Additive service-only discovery, persistent outcomes, named office layer, expiry/multiple-office exclusion and owner-filtered maps | `tenant_employer_offices.sql`, `services/scraper/tests/test_employer_offices.py`, `src/components/jobs/JobsMapView.test.tsx` |
| Job geography: headquarters or stale text produced false pins | Verify each posting place externally; preserve precision; exclude unresolved places; guard ID and original text; tenant-specific map filters and service-only writes; role/company browsing preserves filters and pages the complete selected location | `tenant_job_map.sql`, `services/scraper/tests/test_job_locations.py`, `src/components/jobs/JobsMapView.test.tsx` |

Not every row is fully proved by static checks or mocks. Browser inference, actual
Storage API requests, Edge Functions and hosted operational settings need the
integration/release checks in [Release & Recovery](RELEASE_AND_RECOVERY.md).

## Before changing private data flows

1. Classify each new table/view/RPC in `supabase/tests/helpers/tenant_contract.sql`.
   Separate shared vacancy facts, owner rows and backend-only work. Private grants
   with RLS and no browser policy are deliberate for vectors and scoring queues.
2. Use verified `auth.uid()` as ownership authority. An authenticated member is
   still a foreign tenant; an email, guessed UUID, invitation code or editable
   user metadata is not sufficient authorization.
3. For a definer RPC, fix the search path, revoke default execution grants and
   check authorization and caller ownership before accessing private data.
   Prefer invoker behavior when elevated privileges are unnecessary.
4. Test owner success, foreign reads/writes, guessed IDs, forged identity and
   anonymous/uninvited/unconfirmed denial. Exercise indirect RPC and Storage
   paths as applicable. Use two authorized accounts and real `authenticated`/`anon`
   roles; a service-role-only test cannot establish isolation.
5. Use `queryKeys` and `withActiveUser`. Include account-switch races and export
   failures. Private export blobs must not enter long-lived query caches.
6. Review field purpose, neutral defaults, export, deletion, retention and telemetry.
   Fixtures use reserved example domains and synthetic identities; production
   profiles, documents, vectors and backup data never become test fixtures.

## Code smells to reject during review

- Authorization implemented only with `.eq('user_id', uid)` in browser code, or
  a broad `TO authenticated` policy without ownership and authorization predicates.
- A private query using a raw/shared cache key, tenant `placeholderData`, or a late
  async response accepted after identity changed. Lint cannot verify what a UID
  variable contains; the behavioral session tests still matter.
- Raw console diagnostics or a second telemetry SDK import outside the sanitized
  logger boundary. Source lint catches common calls and Sentry imports, including
  aliases and dynamic imports; it is not general data-flow analysis.
- Empty catches or success-shaped fallbacks for critical writes, private exports,
  inference or authorization. Expected negative authorization must remain denial.
  Optional enrichment may fail independently if the retained data is trustworthy.
- Duplicating PostgreSQL matching fingerprints, enqueueing or score composition in
  browser code. Profile/vector writes enqueue atomically; a second enqueue can
  fail after the successful write and incorrectly report the save as failed.
- Unbounded browser fetches, per-user work inside ingestion triggers, implicit
  shortlist reductions, and page-local aggregations presented as global totals.
- A new implicit profile assumption, real contact fixture, hardcoded credential or
  telemetry project, remote model runtime, or dependency-audit exception.
- Editing an applied migration, resetting a developer database to make a hook
  green, weakening a negative test, or bypassing a required release check.

## Safe cleanup

Search references in code, CLI/API surfaces, tests, CI, docs, generated types and
the database before removing an item. Tests that assert obsolete implementation
details can go; tests protecting ownership, recovery or denial must remain or be
replaced with a behavioral regression for the replacement path.

The follow-up cleanup removes the stale-pruning CLI/wrapper, the misleading mock
test expecting it to delete rows, unused frontend gender fields/copy, the Sentry
account-identity API, and duplicate browser matching/enqueue logic. The retired CLI
now has a negative test, and privacy/source lint blocks common telemetry bypasses.

The following remain intentionally:

- Applied migrations: they are immutable history needed to rebuild a database.
- `prune_stale_catalog_jobs`: a service-only compatibility RPC that returns zero.
  Dropping it needs a forward migration and an inventory of deployed callers.
- `prune_stats: {}` in full scraper sync responses: compatibility metadata only;
  no pruning operation is executed. Removing an API field needs a consumer review.
- Legacy gender values in the private database/generated schema: the frontend
  stops collecting them; deletion or dropping the column needs a separate data
  lifecycle decision and forward migration. Account export/deletion still covers them.
- Tenant guard self-tests, synthetic capacity probes and dated remediation records:
  these retain verification evidence and failure context.
- Private backup snapshots: keep valid recovery points within the 365-day policy;
  do not delete them as source cleanup or include them in repository scans/commits.

## Completion and release evidence

Run `make check`, `npm run db:test:tenancy`, and `npm run build-storybook`.
For database or matching changes, run all SQL suites with `npm run db:test`.
CI rebuilds a disposable database from the entire migration chain and verifies
both generated language models. A developer database behind the checkout uses
`supabase migration up --local`; the runner never migrates or resets it implicitly.

The PR must identify affected matrix rows, behavioral tests and any conditional
integration checks. Report separately: local checks, hosted schema versions,
deployed frontend commit, and operational evidence. A dated remediation document
is historical evidence, not the current deployment source of truth. Recheck alerts,
provider retention, backup restoration and hosted capacity before claiming them.

Saved is a bookmark, never a pipeline transition. Heart controls must remain sibling
buttons on job cards, preserve card selection, support keyboard activation and expose
`aria-pressed`. `tenant_saved_jobs.sql` verifies owner success, foreign denial, denied
identities and Saved count/page/map consistency. `SavedJobButton.test.tsx` verifies
save/unsave without altering Applied progress. Keep bookmark flags through catalog
merges and retain legacy Interested compatibility until older clients are retired.
