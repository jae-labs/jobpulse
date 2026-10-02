# Employer metadata repair — 2 October 2026

The employer enrichment review found inconsistent chart/filter populations, headquarters
substitution into vacancy locations, unsafe dry runs and pagination, stale scoring inputs,
ambiguous employer identities, unsupported sector guesses, an unused duplicate scorer,
dropped frontend fields, and automatic public geocoding in ingestion.

## Implemented contracts

- Employer sectors are shared display metadata. Candidate role domains remain private
  matching classifications; unassessed jobs remain `Uncategorized`.
- Overview exposes separate `sectors` and `categories`. `p_sector` and `p_domain`
  intersect independently and use the same count/page population, including empty pages.
- Only curated, watchlist, or explicitly verified employer metadata supplies industry
  facets. Legacy guessed sectors remain stored as `unverified`; no new name/description
  sector heuristics or automatic Wikidata/Nominatim calls run in ingestion.
- Employer resolution uses literal case-insensitive names, rejects ambiguous results,
  supports explicit curated aliases, and never caches failed inserts without an ID.
- Headquarters never replace posting locations or coordinates. Zero coordinates are
  valid. Incomplete/out-of-range posting coordinate pairs are rejected by ingestion and
  RPC validation; legacy coordinates remain stored with unknown provenance and are hidden
  from paginated results and deep-link details.
- Optional enrichment failures preserve existing employer links and valid posting
  coordinates for the same location. Missing detail bodies still retain hydrated bodies.
- Employer linking is read-only by default, uses stable ID pagination and guarded writes,
  bounds scanned rows including unresolved jobs, and reports actual successes/failures.
  It changes no matching inputs and performs no manual scoring-generation writes.
- Historical proven location substitutions are restored only when snapshot/catalog
  identity and the substituted headquarters value still match. The repair refreshes
  the established embedding/hash path and permits retry after unavailable inference.
- The unused duplicate scorer is removed. Canonical classifications are recomputed by
  the existing bounded tenant worker, with unchanged profile vectors and candidate tracking.
- RPC validation preserves employer identity, industry, and nullable coordinates.
  The complete source catalog uses stable pagination instead of a fixed 1,000-row cap.

## Verification

The complete migration chain and all SQL suites passed on the disposable
`jobpulse-cte-verification` database. The developer database used migration-up without a
reset. TypeScript and Python schema generation matched the disposable rebuild. The full
repository gate, Storybook build, tenant lint, and all tenant SQL suites passed.

New synthetic regression coverage exercises dry-run insert prevention, unresolved full
pages, failed writes, concurrent-link guards, exact/ambiguous employer identity, evidence
upgrades, posting/HQ separation, zero coordinates, optional enrichment failures, snapshot
identity guards, frontend field preservation, source catalogs exceeding 1,000 rows, sector
deep links, chart navigation, and chart/page consistency for two authorized tenants.
Anonymous, uninvited, unconfirmed, and foreign-evaluation sector access is denied.

## Production evidence

Migration `20261002202700_separate_employer_sectors_and_preserve_vacancy_facts.sql`
was applied to the linked production project after a fresh private database/Storage
snapshot and checksum verification. The backup remains outside Git. Production schema
diff is empty; local and hosted security advisors report no error-level issues.

The source-grounded snapshot audit identified seven headquarters-substituted vacancy
locations; all seven were restored with zero compare-and-set conflicts. All 9,012 catalog
rows remain present; an employer-link audit found zero normalized identity mismatches.
Watchlist synchronization established evidence for 420 employer records. All 7,254 legacy
coordinates remain stored for audit with unknown provenance. Sector count/page smoke
checks passed, and both scoring queues completed the current catalog generation.

The description/vector audit found 8,196 eligible bodies with 8,196 current vectors and
no missing or stale eligible vectors. The remaining 816 insufficient bodies retain their
existing catalog/tracking records without misleading vectors; this repair does not claim
to recover unavailable posting descriptions.

Frontend code is verified locally and remains undeployed. The new RPC's optional final
argument preserves existing named/default callers; the deployed frontend can continue
using candidate-domain categories until the reviewed frontend changes are released.
Local tenant tests and production aggregate smoke checks do not replace a hosted
two-account browser release test or a measured load test.
