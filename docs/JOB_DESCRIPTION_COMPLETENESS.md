# Published job descriptions and semantic coverage

JobPulse stores published role bodies rather than synthesizing descriptions from
company, title, location or requisition metadata. Listing discovery is separate
from detail extraction: Workday uses CXS posting details, SmartRecruiters uses its
posting-detail sections, and JobsIreland uses its rendered `Description | linky`
field. Generic pages prefer Schema.org JobPosting data or scoped HTML containers.
Unscoped whole-page text is not a detail-extraction fallback.

The implementation takes inspiration from FreeHire's
[Workday detail hydration](https://github.com/strelov1/freehire/blob/main/internal/ingest/sources/workday.go),
[SmartRecruiters sections](https://github.com/strelov1/freehire/blob/main/internal/ingest/sources/smartrecruiters.go)
and [in-place description repairs](https://github.com/strelov1/freehire/blob/main/cmd/backfill-descriptions/main.go).
These are reference patterns; JobPulse retains its Python/Supabase pipeline.

## Ingestion contract

- `save_jobs_batch` enables detail enrichment by default, including JobsIreland
  and WhatJobs. Known metadata signatures and bodies of 500 characters or fewer
  trigger detail retrieval. WhatJobs snippets always require source detail,
  regardless of length. Length is a suspicion threshold, not proof of a
  missing body; an employer can publish a short, valid ad.
- Greenhouse, Lever, Ashby, Amazon, Personio and Teamtailor retain full provided
  text. Lever includes list sections and additional text; Amazon includes its
  basic and preferred qualifications when supplied. PDF extraction uses a locked
  parser dependency and retains all text pages rather than only the first 15.
- Known stubs, anti-bot pages, closure messages and bodies under 100 characters
  fail the conservative body gate. No heuristic proves that every upstream
  employer published every requirement. Operators must inspect unresolved cases.
- A failed detail request cannot overwrite a stored hydrated body with metadata.
  New unresolved listings are not persisted or embedded. Existing unresolved jobs
  remain available for repair; failures do not delete jobs or candidate tracking.
  Embedding maintenance withdraws derived vectors for known placeholders so they
  do not occupy the semantic shortlist; the existing SQL queue refreshes scoring.
- Shared catalog writes still generate job vectors and use the existing SQL
  catalog-generation/scoring queue. No candidate data is read by the scraper.

## Repairing the existing catalog

Read the scraper's configured database target before applying a repair; it uses
`services/scraper/.env`, not the frontend development target.

```bash
# Fetch candidate details and report proposed changes without writes.
make scrape-descriptions ARGS="--report /tmp/jobpulse-descriptions-preview.csv"

# Apply only published bodies; preserve IDs, source, URL, dedupe key and last_seen_at.
make scrape-descriptions ARGS="--apply --workers 4 --report /tmp/jobpulse-descriptions.csv"

# Scope retries to one source, or bound the number of candidate detail requests.
make scrape-descriptions ARGS="--source Salesforce --limit 20 --report /tmp/salesforce-preview.csv"

# Resume after the last completed keyset page reported in the log.
make scrape-descriptions ARGS="--apply --after-id 10000 --report /tmp/jobpulse-descriptions-resumed.csv"
```

Reports contain public catalog IDs, sources, character counts and outcomes, never
full job bodies or candidate records. Keep reports outside version control.
Reads page by stable ID in batches of 100; at most four independent source/read
and compare-and-set write operations run at once. WhatJobs constant redirect
wrappers resolve to canonical postings without executing page scripts. An access
denial pauses that provider's detail requests for five minutes and reports
`source_blocked`; those jobs remain unverified. Description writes compare the
original body and URL before updating, so concurrent changes are reported rather
than overwritten. A successful repair refreshes its vector. Blocked, expired or
unsupported details remain in the report and do not authorize deletion. Identical published bodies are reported as `confirmed` without writes.

## Embedding the complete body

The job embedding input no longer truncates at 2,500 characters. The same MiniLM
model encodes overlapping token windows and pools normalized chunk vectors into
one normalized 384-dimensional job vector. This lets requirements at the end of
long descriptions contribute while retaining the vector space used by browser
profile embeddings and PostgreSQL matching. The job content hash includes a
preprocessing revision so unchanged stored jobs are recomputed too.

After updating the encoder or repairing an interrupted run, execute:

```bash
make scrape-backfill
```

A missing model or failed encoding never writes substitute vectors. Check logs
and embedding hashes before claiming semantic coverage. Full-body ingestion is
not evidence of search relevance; relevance still needs representative queries.

## Remaining source gaps and read-only coverage

HubSpot's custom detail routes use the public Greenhouse board `hubspotjobs`.
JobsIreland detail extraction checks the vacancy reference when present. Some
vacancies publish fewer than 100 characters. Repairs preserve that exact text,
including when it is too short for the semantic body gate; no text is invented to
meet a length threshold. Short-body vectors remain withdrawn. Use `--missing-only`
to retry only descriptions that fail the gate.

Run an exhaustive catalog/vector audit without crawling or writing database rows:

```bash
make scrape-description-audit ARGS="--report /tmp/jobpulse-description-audit.csv --summary /tmp/jobpulse-description-audit.json --repair-report /tmp/jobpulse-descriptions.csv"
```

Pass `--repair-report` multiple times to include applied repair evidence. A dry-run
proposal never confirms a source. Reports distinguish source-confirmed short
bodies, missing bodies and unverified WhatJobs feeds, and fail if eligible vectors
are missing or stale. A passed body heuristic is not proof of a complete upstream
posting. The CSV contains every job, including unresolved jobs; counts of missing
bodies and unverified feeds can overlap.

## Literal skills and scoring calibration

The `native-sql-v2` scoring revision matches skills as case-insensitive literal
text bounded by non-word characters. Regex punctuation is not interpreted: `Go`
does not match `Google`, while `C++`, `C#`, `.NET` and `Node.js` remain valid skills.
Existing domain and seniority keyword rules retain their deliberate regex syntax.
The backend-only matcher is not a browser RPC.

Default base weights total 100: domain 20, semantic 25, competency 20, seniority
15, salary 10, contract 10. Bonuses and deductions remain separate, with the
existing 0–100 final score cap and dealbreaker cap. Custom weights are preserved;
the migration updates only the exact previous default weight object. Weight-only
edits still recompose stored factors without regenerating vectors. The algorithm
revision invalidates old native factors and queues bounded scoring, including
when vector hashes are unchanged. Candidate tracking and awaiting-vector states
are retained. `literal_skills.sql` and `tenant_literal_skills.sql` prove matching,
calibration, revision refresh and two-tenant isolation.
