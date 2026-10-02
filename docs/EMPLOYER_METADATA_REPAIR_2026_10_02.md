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

## Follow-up: already-linked employer enrichment

The linking backfill did not revisit employer records already referenced by jobs.
`services/scraper/tools/enrich_employers.py` now scans unverified employers directly,
updates their existing IDs with compare-and-set guards, and reports proposals,
unresolved identities, write failures and concurrent conflicts. It is read-only by
default. The existing ingestion resolver consumes the same reviewed registry, so
the repair and future ingestion use the same facts. This is a data repair and Python
change; no schema migration or frontend deployment is required for the live sectors.

Ten additional employer identities have explicit aliases, first-party URLs and
review dates in `services/scraper/config/employer_evidence.json`. No coordinates were
invented for those additions. Published employer addresses are separate from vacancy
facts; conflicting or unavailable addresses remain null. The invalid curated entry
for `JobsIreland Employer` was removed: confidential/unknown employers cannot inherit
the employment board's sector or location.

The live preview scanned 2,178 unverified employers. After a checksum-verified local
snapshot of the affected public metadata, the apply pass updated 32 employer records
with zero failed writes or conflicts. Sector coverage increased from 2,190 to 2,849
vacancies, recovering 659 classifications. Uncategorized declined from 6,822 (75.7%)
to 6,163 (68.4%). A checksum of every complete vacancy row before and after the pass
was identical; all 9,012 jobs, descriptions, posting locations and coordinates remain
unchanged. The unresolved employer report retains 2,146 identities requiring more
evidence. Of the remaining Uncategorized jobs, 4,469 come from JobsIreland, 1,654
from WhatJobs, and 40 from PublicJobs. This is not complete employer coverage.

The 424 source telemetry rows still report 9,428 opportunities. Their counters do
not describe the same population as catalog counts: for example BMS reports 61 versus
10 catalog jobs, JobsIreland reports 4,945 versus 4,971 catalog jobs, and the historical
Intercom source name reports 33 while catalog jobs use `Fin (formerly Intercom)`.
These observations do not prove that exactly 416 records were lost or duplicated.
The opportunities page's 40 records are its loaded page, with a catalog total of 9,012.

Follow-up verification passed `make check` (231 frontend and 143 scraper tests),
`npm run test:tenant-lint`, all eight `npm run db:test:tenancy` suites, and
`npm run build-storybook`. New synthetic tests establish preview-only behavior,
continued scans after full unresolved pages, bounded scans, existing alias ID writes,
concurrency/failure reporting, exact new evidence aliases and placeholder rejection.

## WhatJobs named-employer follow-up

WhatJobs already supplies a per-posting `company` field, and its adapter preserves
that field. Missing employer metadata must not be described as missing employer names.
A further review used those stored names and first-party company pages to establish
13 more identities, including recruitment agencies, materials science, hospitality,
real estate, financial compliance software, IT consulting, pharmaceutical, healthcare
distribution, construction and medical device businesses. The stored Fenergocareers
posting bodies explicitly name Fenergo; that full alias is now recorded without a
general name/description guessing rule. Evidence URLs and review dates remain in the
versioned registry consumed by ingestion and the repair command.

After a separate local public-metadata recovery snapshot, the pass updated 14 existing
employer records with zero failures/conflicts. It classified another 158 vacancies,
139 of them WhatJobs records. Uncategorized is now 6,005 of 9,012 (66.6%), including
1,515 of 1,974 WhatJobs jobs. The complete vacancy-row checksum remains identical.
The remaining WhatJobs employer metadata still needs evidence; known employer names
are usable inputs to that work, not grounds for claiming it cannot be done.

Both a live WhatJobs feed request and a tracked posting request returned HTTP 503 in
this follow-up. That prevented validating corrections to ambiguous platform/account
labels such as SmartRecruiters, Lever and HireHive. Those labels were not changed or
assigned platform industries. Existing snippets/descriptions, IDs and candidate
tracking were retained. The current source adapter was inspected, not modified.

## Database-only reconciliation

At the user's direction, this pass made no requests to job sites or company websites.
It read only the production shared employer and job catalog. The repair command now
supports `--database-only`, reconciling existing trusted sectors across punctuation
and legal suffix variants while preserving countries and business units. Conflicting
trusted classifications and changed donors are rejected. An optional reviewed witness
file supplies explicit business statements already present in job bodies; employer
ownership of that posting, its exact company identity, whole-body SHA-256 and excerpt
are checked before each proposal or write. Role keywords and descriptions of recruiter
clients are not company-sector evidence. The witness file is retained with the ignored
local recovery snapshot; synthetic fixtures establish the safety contracts.

The pass scanned 2,132 unverified employers and updated 22 records with zero failures
or concurrency conflicts: ten existing-sector aliases and twelve reviewed stored
self-descriptions. This classified another 90 vacancies, including 65 WhatJobs jobs.
Uncategorized declined to 5,915 of 9,012 (65.6%), with 1,450 WhatJobs jobs still unresolved.
The complete vacancy-row checksum remains identical to the earlier repairs. Employer
fields with unsupported legacy provenance were not promoted as verified coordinates
or headquarters; only sectors were established. No schema or frontend changes were needed.

Stored bodies also prove that some feed labels represent multiple hiring companies:
SmartRecruiters postings describe Element Six, Eurofins and AECOM; HireHive includes
Unio; ACCA Careers includes Grant Thornton. A JobsIreland placeholder body explicitly
names Dublin Airconditioning Limited. These require posting-specific identity repair;
promoting an entire platform/account employer row would misclassify other vacancies.
This pass did not change job company names, IDs, embeddings or candidate tracking and
does not claim complete sector coverage or completion of those identity corrections.

The full completion gate passed with 231 frontend and 154 scraper tests, all eight
tenant SQL suites, tenant lint and the Storybook build. Database-only regressions cover
full-page donor scans, country/business-unit preservation, conflicting and changed
donors, mismatched employer/company witnesses, changed descriptions and missing excerpts,
placeholder rejection, read-only previews, guarded updates and repeat-run idempotence.

## Stored-company enrichment and external research follow-up

Reviewed stored business statements and named Community Employment programmes updated
270 employer records; two additional exact legal-name aliases covered five more jobs.
Together these classified 1,074 vacancies (885 JobsIreland and 189 WhatJobs). Employer
descriptions were supplied only when an exact reviewed business excerpt supported them.

A subsequent official-website evidence pass updated 24 employer records, including
previously verified records needing complete company metadata. Broadridge now has its
financial technology sector, official website, business description and documented
Dundrum office address/coordinates. Those coordinates are explicitly employer-office
facts; the published coordinate observation is from 2022 and the current contact page
confirms the same office. Unsupported company fields remain null.

Live verification reports **4,601 Uncategorized of 9,012 vacancies (51.1%)**, including
1,190 WhatJobs vacancies. The complete vacancy-row checksum is still
`ac1c1d318099e8458d2234338455d253`. No job/candidate data, migrations or deployed frontend
were changed by these employer metadata passes. Recovery snapshots and checksums are
local under ignored `.backups/jobpulse-company-*` directories.

The reusable external research script is documented in [EMPLOYER_RESEARCH.md](EMPLOYER_RESEARCH.md).
It reads both stored sources, discovers exact company identities through Wikidata and
supports Geoapify via `GEOAPIFY_API_KEY`. No Geoapify key was available during this work:
geocoding response behavior was tested with synthetic provider responses, rather than
claiming a live provider run. Production smoke checks confirmed catalog reads and
Broadridge's reviewed registry proposal. A live Wikidata query for the stored Trading 212
legal name returned its website and an app entity; it remains a review proposal, not a
verified legal company or sector. Unknowns and ambiguous platform/account names
remain explicit; this work does not claim complete sector or coordinate coverage.

Verification: `make check` passed with 231 frontend tests and 170 scraper tests; tenant
lint, all eight tenant SQL suites and the Storybook build also passed.
