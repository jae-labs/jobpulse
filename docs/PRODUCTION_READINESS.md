# Production readiness remediation — 3 October 2026

The validated source findings have been remediated and the local gates are green.
Authorized read-only hosted verification confirms the database contracts and
deployed frontend/function evidence below. Release approval remains pending
a database runtime security patch and operational evidence. The approved
solo-maintainer merge protection is now applied and verified.

The original review covered base `47385b2c994a8891583510ab5f590dbde742fb11`
and existing user changes. Work continued in the shared checkout; concurrent
commits advanced HEAD during remediation. Existing document deletions and applied
migrations were preserved. No developer database was reset.

## Findings and final behavior

| Finding | Resolution and evidence |
| --- | --- |
| Account-switch writes | Services accept the initiating UID. The database rejects mismatched owners instead of rewriting them. Ownerless bookmark/invitation/deletion RPCs capture the initiating access token. Export captures the same transport and rejects identity changes before download. SQL A/B negatives and transport regressions pass. |
| Browser maintenance privileges | Forward migration removes current TRUNCATE, REFERENCES and TRIGGER privileges and browser defaults for postgres-owned future application tables. Tenant inventory and intentional-grant guard regression pass. Hosted application tables are all postgres-owned. Provider-owned supabase_admin defaults are not configurable by postgres; classification/grant tests remain required for any future public table. |
| Stale inferred vectors | Guarded vector RPC locks the profile and compares the inference snapshot atomically. Changed account/profile snapshots are denied; valid owner saves succeed. Legacy RPC remains an intentional compatibility API for existing clients. |
| Four failing SQL suites | Isolated synthetic fixtures now exercise trusted public employer sectors, private candidate factors, canonical stages and assessed metrics. All behavior suites pass without loosening tenant negatives. |
| Rejected stage and neutral filters | One runtime status vocabulary preserves rejected and rejects unknown values. Explicit neutral URL values prevent defaults reappearing after All/reset. IDs and match ranges are validated. |
| Failed/concurrent optimistic writes | Detail and list caches remain server-authoritative. Controls expose pending/error state and writes invalidate owner-scoped caches. Offline overlapping failures preserve rows, totals, offsets and detail. App selection updates only after a confirmed write. |
| Cold compact deep links | Inspector opens after the requested job arrives, including jobs outside the filtered list. Loading/retry/not-found states are visible. Closing clears the selected URL and does not immediately auto-select again. Browser cold-link and regression test pass. |
| Native keyboard interaction | Fullscreen shortcuts respect buttons/links and reduced motion. Actual browser Space activation closes the inspector. Account-menu Escape returns focus to its trigger. |
| Hidden query/save failures | Sources and jobs expose localized errors; stale list errors suppress healthy-looking results. Profile save catches rejected promises. Raw database messages are not displayed. Dismissed banners reset for a new view/error without an effect-driven extra commit. The global Sources Retry refreshes Sources instead of Overview. Three dismissal regressions pass. |
| Profile persistence versus matching | Committed profile saves remain successful if model setup fails. Durable awaiting-embedding status is visible, bounded automatic resume runs once per account, and explicit retry remains available. Failure/retry regression passes. |
| Long profile inference | Structured fields precede summary, preprocessing is versioned, and bounded token windows contribute to a normalized pooled vector. A late requirement changed real browser output under built production CSP. |
| Worker lifecycle and model provenance | One sequential worker is reused, terminated after idle/timeout and disposed on identity changes. Browser assets are checksum-pinned; Python model snapshot is immutable and part of job content hashes. Three synthetic cross-runtime reference vectors have minimum cosine 0.9896. This small corpus is a smoke test, not a relevance-quality evaluation. |
| Ingestion failure reporting | Partial writes retain persisted data and carry failed-write/vector-pending counts. Full and targeted syncs return incomplete health. API returns 207/503 and CLI exits nonzero. Blocked/unsupported source outcomes cannot look fully healthy. |
| Concurrent local sync | Single-flight admission returns 409 while another sync runs; a subsequent request succeeds after completion. No distributed queue was added to the local operator tool. |
| Neutral work preferences | Empty work mode remains unset; selecting Remote does not add Hybrid, and the final preference can be cleared. Interaction regression passes. |
| Decorative rerenders and styling | Search timer animation removed. Mobile search gets a full row. Undefined map token, broad menu transitions, overlay shadow drift and hover-only reorder affordance corrected. Inspector accessible name and salary translation repaired. |
| Mixed query/type boundaries | Domain query modules share a compatible facade and typed RPC argument builder. Cache orchestration moved out of persistence services. Persisted scoring rules, analysis and factors are validated at runtime. Unused TypeScript declarations are rejected; Pyright reports zero errors and runs in CI/Make. |
| Removed operating documentation | Maintained operations guide preserves relevant procedures and historical capacity evidence. Incoming links repaired; local link and static translation-leaf checks run in lint. Historical evidence is explicitly not current hosted certification. |
| Backup credential arguments | Explicit URLs are stripped before CLI invocation. The pinned CLI's dump filters run with libpq credentials supplied by environment to a digest-pinned official PostgreSQL container. Actual roles/schema/data dump succeeded on the synthetic local stack; private file modes are enforced. Storage bytes require separate backup. |
| Restore safety and bootstrap collisions | Restore validates Storage, symlinks, checksums and local Docker before resetting, binds to its repository, and atomically replaces exported table data. Developer-account seed is separated from demo catalog seed. Four regressions pass; an actual disposable restore recovered Auth identity, authenticated profile/document metadata and checksum-identical Storage bytes, with anonymous file access denied. |
| Account deletion integration | One consolidated test covers two real local Auth users, profile/document/invitation cleanup, foreign-file survival, forged UUID/email denial, uploads racing deletion, cleanup retry and old-session denial. Original local command remains a compatibility entrypoint; CI runs the enhanced test. |
| Generic commit subjects | Descriptive future subjects are now explicit guidance. Existing shared history was preserved. Instructions alone cannot enforce meaningful subjects. |
| Executable portability | The concurrent literal `$PATH/.local/bin/agy` fallback could never expand. It now resolves the current user's home directory; a synthetic-home regression passes. |

## Verification evidence

| Gate | Result |
| --- | --- |
| `make check` | Lint, TypeScript, 282 frontend tests in 60 files, 18 Node tests, production build, Ruff, zero Pyright errors, 229 scraper tests passed |
| `npm run build-storybook` | Passed |
| `npm run test:tenant-lint` | Guard and seven negative self-tests passed |
| `npm run db:test:tenancy` | All 12 suites passed |
| `npm run db:test` | All 23 SQL suites passed |
| Disposable full migration chain | Fresh reset through `20261003221500`, both ordered seed files succeeded, all 23 SQL suites and the separate 12-suite tenant run passed; both generated language models match the checked-in files |
| Real local account deletion | Enhanced two-account Auth/Storage/Function test passed with JWT verification enabled |
| Dependency advisories | JavaScript and locked Python audits found no known vulnerabilities at verification time |
| Secret scanning | Git history and tracked/nonignored source scan passed; private local environments/backups are outside the source scan |
| Browser smoke | English and Portuguese opportunities reflow at 320/390/768/1024/1440 px; cold compact detail outside filtered list; native Space and menu Escape; built-CSP inference and cross-runtime corpus |
| Backup transport | All three CLI-filtered database dump stages succeeded against the disposable local stack |
| Local recovery drill | Database plus Storage restored on the disposable stack; synthetic Auth identity, owner-visible profile/document metadata and exact file checksum verified; anonymous Storage access denied. Fresh ordered seed files also succeeded. |

## Authorized hosted verification

Read-only checks on 3 October 2026 verified Supabase project
`mlpxkpkaiwryiawkllek` and GitHub repository `jae-labs/jobpulse`:

- The project is healthy and all 27 migration versions match the checkout,
  through `20261003221500`. No hosted migration was applied by this chat.
- All 15 public tables have RLS; there are no public views. Internal scoring and
  lookup tables have no browser SELECT grants. No application table grants
  TRUNCATE, REFERENCES or TRIGGER to the browser.
- Public function bodies/settings, constraints, indexes, triggers, RLS flags,
  row policies, browser table grants and Storage policies match the tested
  disposable schema. All 164 column metadata records match by table/column name;
  this is catalog evidence, not a hosted two-account behavioral test.
- Both Storage buckets are private with bounded file sizes and MIME allowlists.
- Hosted Auth public settings show Google enabled, email/password, anonymous
  and phone providers disabled, and signup disabled. Email auto-confirm is true,
  but email authentication is disabled. The leaked-password advisor warning is
  not currently an exposed password-login path; do not enable that provider to
  silence the warning.
- Fourteen real hosted anonymous API checks passed: private table reads return
  no rows; internal table/RPC reads are denied; unsupported deletion methods and
  a tokenless deletion request are rejected. No identity/confirmation was supplied
  and no candidate data was modified. Two-account hosted testing remains pending.
- Deployed deletion function version 28 requires JWT verification; its two
  source files match the reviewed local files exactly.
- [CI run 37153595491](https://github.com/jae-labs/jobpulse/actions/runs/37153595491)
  passed all four required job names at `c99eaec480f320c9eb90d806f570cbd9823ad46d`.
  GitHub's Cloudflare check reports a successful deployment of that commit;
  its commit-specific preview and production reference `index-BCjX6njR.js`,
  whose production bytes matched the local build at that verification. Final recovery, seed,
  portability, Sources retry/error dismissal and documentation changes are outside
  that commit. They are prepared on `codex/production-readiness`. The asset
  comparison records the build before those final UI changes.
- Scoring cron is active every second. Its last-hour snapshot had 3,544 runs,
  zero failures and a recent success. The queue contained two completed work
  items, with no pending/retrying work. This idle snapshot is not a load test.
- `main` was unprotected. After explicit user approval, the solo-maintainer
  protection was applied and read back: PRs, all four strict CI checks,
  administrator enforcement and conversation resolution required; force pushes
  and deletion disabled; zero independent approvals. Administrator-authored
  changes remain mergeable after the technical checks pass.
- Hosted PostgreSQL reports 17.6. Supabase's current security patch is 17.11;
  upgrade preflight found no ltree/btree_gist extension, custom estimator or
  public PGP-encryption function. Runtime upgrade remains unapplied.

Build gzip measurements: initial static JavaScript graph 266.0 KiB (275 budget),
jobs route 13.8 KiB (20), map 271.2 KiB (300), map worker 141.9 KiB (165), inference
worker 151.2 KiB (175). The lazy map still emits Vite's raw-size warning. Separate
workers/model/WASM transfers are excluded from the initial graph; budgets do not
establish mobile parse time or GPU performance.

Browser inference on this machine measured approximately 2.43 seconds for the
first test and 1.94 seconds for the repeat long-input test with local assets. These
are not public-network cold-download or hosted load measurements. Reflow checks
do not establish full WCAG AA conformance, physical mobile-keyboard behavior,
200% text zoom, or all supported browser versions.

## Release blockers and remaining evidence

1. Plan and execute the eligible provider-supported PostgreSQL security patch
   after verifying production recovery and a maintenance window. See
   [Supabase's 17.11 security release](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
2. Publish the prepared release branch with its own CI/commit evidence.
   Repeat controlled hosted account/Storage/inference smoke on approved
   synthetic identities; read-only schema parity does not replace it.
3. Test alert delivery, provider retention and representative production
   database-plus-Storage recovery. The synthetic local recovery drill does not
   establish production-scale recovery time or provider recovery configuration.
4. Measure hosted reads alongside catalog refresh and concurrent profile edits
   before claiming the five-minute matching target or a particular user capacity.
   Complete target-device map, zoom, touch/keyboard and browser compatibility checks.

The earlier automatic-review access block was resolved by the user's explicit
read-only authorization. Hosted checks remained read-only; the subsequent
GitHub protection write was separately approved and verified. The applied settings
payload, runtime-upgrade preflight and release steps are in
[Production Release Actions](PRODUCTION_RELEASE_ACTIONS.md). Hosted fixture writes,
runtime changes and source publication/deployment remain separate actions.

The hosted advisor's no-policy notices concern intentionally backend-only tables;
its definer-function notices require contract review, not blanket revocation of
authorized product RPCs. See the [Supabase advisor documentation](https://supabase.com/docs/guides/database/database-linter)
and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Use the [release checklist](RELEASE_AND_RECOVERY.md), [security contract](SECURITY_AND_MULTI_TENANCY.md),
[performance policy](PERFORMANCE_AND_SCALABILITY.md) and [operations guide](OPERATIONS.md)
for the remaining controlled release work.
