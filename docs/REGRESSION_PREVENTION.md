# Regression prevention and safe cleanup

Ownership, asynchronous state, scoring, query contracts and privacy are database and
application invariants. Changes preserve the behavior-to-test matrix below.

Instructions and static lint cannot guarantee security. PostgreSQL grants, RLS and
caller checks enforce access; role-based negative tests prove the declared behavior.
Hooks provide local feedback, and CI verifies published source. A new data path
needs its own behavioral tests even when every existing check passes.

## Behavior-to-test matrix

Each row defines a current contract and the tests that verify it.
Test paths in this table are relative to the repository root. SQL suites live under
`supabase/tests/` and run with `npm run db:test`; tenant suites also run at pre-push.

| Behavior | Contract | Verification |
| --- | --- | --- |
| Source learning and measurement | Sent attempts, replies and cooldown skips remain distinct; positive transport preferences and query-free destination routes bind to a company/configured URL, expire and retain failure evidence; confirmed detail-body reuse remains bounded and source scoped; stage timings remain inclusive; input coverage and historical comparisons never invent missing data or a safe quota; diagnostics omit payloads and lease credentials | `services/scraper/tests/test_source_experience.py`, `services/scraper/tests/test_detail_cache.py`, `services/scraper/tests/test_durable_worker.py`, `services/scraper/tests/test_browser_runtime.py` |
| Pagination | Count and page share a SQL statement and filter population; empty/high-offset pages retain totals; sorts have stable ID tie breaks | `jobs_pagination.sql` |
| Invitation ownership | Own access row and issuer-owned invitations only; foreign IDs/codes cannot authorize reads or deletion; pending invitations are bounded | `tenant_catalog.sql`, `tenant_rows.sql`, `tenant_invitations.sql` |
| Document path ownership | Storage object access requires the caller's UID path prefix and an owned metadata row; claiming an orphaned foreign path cannot read or destroy the object | `tenant_document_paths.sql` |
| Document quota ownership | Ownership is rejected before any per-owner count, so a foreign owner cannot infer another member's document count from a distinct error | `tenant_document_quota.sql` |
| Input validation and tenant rollback | Validate JSON shape, size, lists, numbers and vectors at the database boundary; roll back only the failing tenant's slice | `tenant_scoring_queue.sql` |
| Telemetry privacy | Use the explicit-DSN diagnostic allowlist; drop identity, free text, request data, breadcrumbs, tracing and replay; consume invitation parameters first | `src/lib/sentry.test.ts`, `src/lib/logger.test.ts`, `src/components/auth/LoginView.test.tsx`, source lint |
| Filter consistency | Keep status/salary/sort enums aligned; use annual EUR thresholds and bounded literal search/location input | `jobs_pagination.sql`, `salary_normalization.sql`, `src/components/jobs/JobsView.test.tsx` |
| Bounded ingestion and scoring | Advance one generation per vector statement; enqueue profile/vector changes atomically; process bounded durable slices outside request/write paths | `tenant_scoring_queue.sql`; [capacity probe](OPERATIONS.md#capacity-verification) |
| Exact shortlist coverage | Exact stable shortlist of up to 1,500 eligible vectors; trim native results only after completion | `tenant_scoring_queue.sql` with 1,601-vector fixture |
| Durable save and retry | Persist awaiting-embedding state; retain usable assessed results; failed current-vector work retries; check UID and profile hash after inference | `tenant_scoring_queue.sql`, `src/lib/userProfile.test.ts` |
| Authoritative catalog metrics | Server catalog supplies shared normalized sectors and facets; top 20 plus Other and Uncategorized reconcile across overview, pagination and maps independently of loaded pages | `overview_metrics.sql`, `tenant_sector_groups.sql`, `src/components/jobs/JobsView.test.tsx` |
| Assessed match statistics | Match statistics use assessed jobs; categories include Uncategorized; chart labels name the population | `overview_metrics.sql`, `src/components/dashboard/OverviewView.test.tsx` |
| Account-scoped freshness | Central owner-scoped keys, identity checks around asynchronous work, account remount, complete invalidation and bounded freshness polling | `src/lib/queryKeys.test.ts`, `src/hooks/useTenantSwitch.test.tsx`, `src/hooks/useAuthSession.isolation.test.ts`, `src/hooks/useJobTrackingUpdates.test.tsx` |
| Search states | Debounce/cap input; use authoritative server results; show loading/error/retry/empty states; suppress stale results on failure | `src/components/ui/CommandMenu.states.test.tsx` |
| Command palette shortcut | The always-mounted shell owns the global Cmd+K/Ctrl+K listener and toggles the lazily mounted palette from any view | `src/App.commandMenu.test.tsx`, `src/hooks/useCommandMenuShortcut.test.ts` |
| Durable crawl isolation | Browser and anonymous roles cannot inspect, enqueue or finish operational work; current leases fence catalog, snapshot and vector writes; concurrent claims and expired recovery remain safe; source/detail/vector scheduling remains fair; task slots share one claim budget and deadlines terminate descendants; interruption leaves leases recoverable; automatic startup uses per-source eligibility so delayed failures do not block peers; completed and failed source crawls wait at least six hours, with longer retry dates preserved | `tenant_crawl_runtime.sql`, `tenant_crawl_enrichment.sql`, `tenant_crawl_fairness.sql`, `scripts/test-crawl-concurrency.mjs`, `services/scraper/tests/test_durable_worker.py`, `services/scraper/tests/test_process_execution.py` |
| Public source acquisition | Parsers import no network/database modules; malformed payloads and denials remain failures; declared challenges stop HTTP discovery; wire encoding preserves identities; browser requests, asset transfers, decompression, snapshots and replay remain bounded; source context and host cooldowns survive asynchronous browser callbacks; overlapping pages retain richer facts without inflating vacancy counts; canonical and tenant Rezoomo URLs use the same published company board | `services/scraper/tests/test_adapter_contracts.py`, `services/scraper/tests/test_http_client.py`, `services/scraper/tests/test_careers_discovery.py`, `services/scraper/tests/test_source_page_counts.py`, `services/scraper/tests/test_request_ledger.py`, `services/scraper/tests/test_browser_runtime.py`, `services/scraper/tests/test_snapshots.py` |
| Listing location evidence | Linked cards own their titles and locations; country filters and neighboring cards cannot establish eligibility; unknown generic/Rezoomo locations remain unknown; presentation locale segments and query names never establish geography; absent descriptions stay empty for detail enrichment; ambiguous Workday locations require published Irish facet proof | `services/scraper/tests/test_generic_html.py`, `services/scraper/tests/test_icims_runtime.py`, `services/scraper/tests/test_location_validation.py`, `services/scraper/tests/test_adapter_contracts.py` |
| Posting availability | Existing jobs default unverified and only fenced source scraping promotes active; standalone verification cannot activate or refresh jobs; active browsing requires fresh listing evidence; expiry and acquisition failures remain unverified, explicit closure preserves candidate history, details cannot reopen jobs, and list/map scopes share guarded filters | `tenant_job_availability.sql`, `services/scraper/tests/test_job_availability.py`, `src/lib/jobAvailability.test.ts` |
| Catalog retention | Missing/old data is not evidence of closure; never run age-only pruning; preserve candidate tracking during deduplication; shared posting aliases require matching URL/title/location/closure evidence and reuse existing catalog keys; maintenance failures and tracking conflicts remain visible | `tenant_catalog_retention.sql`, `services/scraper/tests/test_pipeline_ingestion.py`, `services/scraper/tests/test_cli_outcomes.py`, `services/scraper/tests/test_boards_catalog.py`, `services/scraper/tests/test_jobstash.py`, `services/scraper/tests/test_repository_safety.py`, `services/scraper/tests/test_catalog_deduplication.py`, `candidate_statuses.sql` |
| Inference supply chain | Locked dependency audits, checksum-pinned same-origin assets and bounded browser workers; verify the production CSP after upgrades | CI audits, `scripts/prepare-browser-model.mjs`, release browser inference smoke test |
| Map state and camera updates | Keep GPU points during same-scope pending requests, clear on errors or scope changes, and restore layers after style reload | `src/components/jobs/JobsMapCanvas.test.tsx`, `src/lib/cspHeaders.test.ts` |
| Company identity proposals | Exact retrieval and published alias witnesses feed public-only agy facts; invented citations/IDs and omitted decisions fail validation; unsupported positives, subsidiaries and departments retain uncertainty; bounded acquisition, isolated provider execution and validated caches never authorize catalog writes | `services/scraper/tests/test_company_review.py` |
| Company research providers | Paid models/fallback require explicit opt-in; free models use genuine fresh client sessions with denied tools and no conversation reuse; child environments omit backend secrets, output and deadlines are bounded, malformed/invented claims fail existing validators, caches bind provider/cost policy and preserve actual acquisition provenance | `services/scraper/tests/test_research_provider.py`, `services/scraper/tests/test_company_review.py` |
| Company metadata reuse | Freshly active vacancies define the default cohort; pagination covers eligible employers; identity-bound successful proposals skip API calls, unknowns stay unknown, failed/partial batches never become complete, concurrent runs serialize requests, corruption fails visibly and refresh preserves previous successful data on failure | `services/scraper/tests/test_company_proposals.py`, `services/scraper/tests/test_ai_enrichment.py` |
| Company research workflow | All stages share a sanitized public cohort; snapshot facts, identity decisions and AI leads remain separate; failed stages checkpoint and stop later batches; live heartbeats terminate and child deadlines clean up work without catalog writes | `services/scraper/tests/test_company_campaign.py` |
| Local company snapshots | Atomic per-source imports retain the previous index on failure; registered addresses never establish operating offices; domain conflicts, subsidiaries, closed places and unknown countries remain explicit review candidates; fuzzy typo/token-order suggestions retain changed qualifiers, bounded retrieval and transactional search parity without asserting identity; all pilots make zero catalog writes | `services/scraper/tests/test_company_index.py` |
| Company office evidence | Additive service-only discovery, persistent outcomes, named office layer, expiry/multiple-office exclusion and owner-filtered maps; total lookup budgets use bounded database pages, preview/apply process distinct pairs, fresh outcomes remain skipped and provider failures stop scheduling while in-flight work drains; bounded concurrent lookups retain a single database writer, shared pacing/cooldowns, coordinated cache fills and credential-free timings | `tenant_employer_offices.sql`, `services/scraper/tests/test_employer_offices.py`, `services/scraper/tests/test_company_research.py`, `src/components/jobs/JobsMapView.test.tsx` |
| Verified vacancy geography | Verify each posting place externally; preserve precision; exclude unresolved places; guard ID and original text; tenant-specific map filters and service-only writes; role/company browsing preserves filters and pages the complete selected location | `tenant_job_map.sql`, `services/scraper/tests/test_job_locations.py`, `src/components/jobs/JobsMapView.test.tsx` |

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

Preserve these current contracts:

- Applied migrations rebuild the schema in order and remain immutable.
- `prune_stale_catalog_jobs` is a service-only RPC returning zero. Removing a supported
  RPC requires a forward migration and a caller inventory.
- `prune_stats: {}` is a supported full-sync response field; no pruning operation runs.
  Removing a response field requires a consumer review.
- Private schema fields remain covered by account export/deletion even when the
  frontend does not collect them. Dropping a field requires a data lifecycle review
  and forward migration.
- Tenant guard self-tests and synthetic capacity probes verify isolation and bounded work.
- Private backup snapshots remain valid recovery points within the 365-day policy;
  keep them outside repository scans and commits.

## Completion and release evidence

Follow the [required verification contract](../AGENTS.md#required-verification) and the affected rows of
the behavior-to-test matrix. The [UI verification guide](../packages/ui/DESIGN.md#storybook-and-verification)
explains browser checks and reviewed visual fixtures.
CI rebuilds a disposable database from the entire migration chain and verifies
both generated language models. A developer database behind the checkout uses
`supabase migration up --local`; the runner never migrates or resets it implicitly.

A change summary identifies affected behavior contracts, tests and conditional integration
checks. Review and update the relevant guides in the same change. Verify local checks,
hosted schema, deployed frontend and operational behavior separately. Recheck alerts,
provider retention, backup restoration and hosted capacity before claiming readiness.

Saved is a bookmark, never a pipeline transition. Heart controls must remain sibling
buttons on job cards, preserve card selection, support keyboard activation and expose
`aria-pressed`. `tenant_saved_jobs.sql` verifies owner success, foreign denial, denied
identities and Saved count/page/map consistency. `src/components/jobs/SavedJobButton.test.tsx` verifies
save/unsave without altering Applied progress. Keep bookmark flags through catalog
merges. The supported Interested input maps to `status=new, is_saved=true`.
