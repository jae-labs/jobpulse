# Production review remediation — 1 October 2026

The reported `relation "filtered" does not exist` outage and all three follow-up database migrations are applied to hosted JobPulse. Browser, ingestion and workflow fixes are in this change set; they must be deployed from the reviewed commit before the overall remediation is live.

## Findings

| Finding | Change | Evidence |
| --- | --- | --- |
| F1: pagination CTE outage | Count and page use one statement; high offsets preserve totals | Pagination SQL suite; hosted accounts both return 9,012 total / 40 items |
| F2: access records / invitations cross tenants | Own access record and issuer-owned invitation RLS; private recovery/deletion; pending quota and pagination | Tenant invitation read/code/delete negatives and unfiltered row tests |
| F3: malformed configuration interrupts ingestion | Bounded scoring input validation, backend queue and per-tenant rollback/backoff | Invalid rules/vector tests and failed-tenant / healthy-tenant regression |
| F4: telemetry can collect private data | Explicit production DSN, strict error allowlist, no identity/replay/tracing/breadcrumbs, generic production console fallback, invitation URL consumption before telemetry | Synthetic envelope sentinel tests |
| F5: filter / sort incompatibility | Shared validated status/salary/sort contracts; annual EUR thresholds and literal search/location input | Pagination/filter SQL suite |
| F6: ingestion × user scoring fan-out | Statement-level catalog generation and durable scheduler, bounded by slices and elapsed time | SQL ingestion test and synthetic 1,000-profile capacity probe |
| F7: approximate shortlist underfills | Exact stable ranking up to 1,500; incremental changed-fact work | 1,601-vector fixture yields exactly 1,500 native results; both hosted accounts now have 1,500 |
| F8: save / retry loses unfinished work | Embedding save atomically enqueues; durable desired/completed state; text changes await a new vector; current-hash failed work retries | Missing/current/changed-vector and failure recovery tests |
| F9: loaded-page facet counts mislead | Removed page-local counters; stable full-catalog location facets | Jobs view tests and overview location contract |
| F10: unassessed jobs counted as poor matches | Assessed-only match averages/distribution; explicit coverage; Uncategorized included; skills population relabeled | Hosted histogram sum = 1,500; categories sum = 9,012 for each account |
| F11: stale detail / weights / freshness | Consistent factor composition, complete invalidation, bounded polling, account lifetime remount and before/after session guards | Query/cache, account-switch and scoring tests |
| F12: command search hides failures | Loading/error/retry states, input cap and authoritative server results | Command state tests, including retry and a nonlocal server match |
| F13: outages cause destructive stale-job pruning | Removed automatic age-only pruning; compatibility RPC returns zero | Partial-source outage retention regression |
| F14: inference dependency advisories | Pinned supported Transformers stack; checksum-verified same-origin model/WASM; dedicated browser worker; dependency audit gates | JavaScript audit: zero advisories; Python audit: zero; production-CSP browser inference: 384 finite dimensions / unit norm |

Neutral profile defaults replace citizenship/work-mode/employment/salary assumptions. Gender collection was removed; existing private values are retained until account deletion. Test contacts are explicitly synthetic. Account exports include own profile, statuses, evaluations, document metadata and issued invitations, fail on errors, and refuse downloads after an account switch. Private document bytes are downloaded separately through expiring links. The public privacy notice uses `luiz@justanother.engineer`; completed backup and operational-history retention is capped at 365 days.

## Verification and rollout

- Full `make check`: frontend lint/typecheck/tests/build plus Ruff and 53 Python tests.
- Frontend: 208 Vitest tests and six Node guardrail/retention tests. Coverage gate and Storybook build pass.
- All 15 auto-discovered SQL suites pass after a clean disposable reset. Database lint reports no errors; both generated language models match that schema.
- Hosted forward migrations are applied; linked public-schema diff reports no changes. Both accounts have complete queues, zero failed/unfinished profiles, 1,500 native evaluations, and no access to work tables or worker execution.
- Fresh complete database/Storage backup was created with explicit approval and its checksums verified. Its files remain ignored and private.
- Gitleaks finds no secrets in tracked/non-ignored source or reachable Git history. Ignored local credentials and production backups are sensitive and intentionally excluded from repository scans and commits.
- `main` requires the four quality/database/tenant/scraper checks, an approving code-owner review, current approvals, resolved conversations, and administrator enforcement. No force push or deletion is allowed. AST checks reject new privileged clients, unsafe query keys and tenant placeholder retention; database negative tests remain the security authority.

## Remaining operational limits

This is not a legal compliance certificate, a penetration test, or a hosted 1,000-user load certification. See [the capacity probe](CAPACITY_PROBE_2026_10_01.md) for measured SQL limits and exclusions. Configure actual alert delivery for backlog/failures and check recovery time on a representative restored backup before a wider launch. Existing private evaluation factors remain readable while a new profile embedding is unfinished.

Supabase advisors still flag the nine intentional authenticated SECURITY DEFINER APIs and four backend tables with RLS but no policies. Their authorization checks, private grants and negative tests are deliberate; do not add permissive policies to silence these notices. The previous missing invitation foreign-key index is fixed. Low-usage index notices are expected with two accounts and do not justify deleting ownership indexes.

Leaked-password protection remains disabled in hosted Auth. The application uses Google OAuth and hosted aggregate inspection found zero password accounts. Enable protection before offering password sign-in (Supabase requires Pro or above), or disable an unused email/password provider after verifying its effects. This hosted setting cannot be established by a SQL migration. Provider account controls and log-retention configuration still require operational review; the application payload contract alone cannot erase historical telemetry or backups.

Frontend production deployment is a separate release from SQL. Review the prepared pull request and pass its required checks before merging; Cloudflare Pages uses the protected `main` branch for production.
