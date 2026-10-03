# Scraper Architecture & Ingestion Pipeline

`services/scraper/` is a vacancy data provider. It does not read profiles, evaluate candidates, or write `user_job_evaluations`.

## Data Flow

```mermaid
flowchart LR
    Sources[Employer and ATS sources] --> Crawlers[Core and generic crawlers]
    Crawlers --> Clean[Validation, text cleaning, salary normalization]
    Clean --> Jobs[save_jobs_batch: shared jobs]
    Jobs --> Embeddings[SentenceTransformers MiniLM 384d job embeddings]
    Embeddings --> DB[(Supabase job_scoring_embeddings)]
    DB --> Trigger[PostgreSQL advances catalog generation]
```

`pipeline/runner.py` coordinates the crawlers and catalog maintenance. Every adapter writes through `database/repository.py:save_jobs_batch`, which validates, cleans, deduplicates, and saves shared vacancy facts. Once each batch is persisted, `database/embeddings.py:prepare_embeddings` computes missing or changed `all-MiniLM-L6-v2` job vectors. The model runs locally with Apple Metal when available and CPU otherwise. It never loads a profile model or candidate data.

The statement trigger on `job_scoring_embeddings` advances one catalog generation. Candidate scoring is decoupled from ingestion and driven by the durable worker. User profile vectors are generated in a browser worker; profile/vector writes enqueue work atomically. `rescore_user` requests a retry or shortlist limit change and does not score synchronously. A completed request keeps at most 1,500 native evaluations. Catalog refreshes score only changed or missing facts. Score composition for weight changes happens in `get_jobs_page` and overview metrics from stored sub-scores.

The scraper hashes scoring job facts separately from the embedding document. A salary or location change updates the job vector row even if the encoded text is unchanged, which invokes the SQL trigger to refresh affected evaluations.

## CLI and API

- `make scrape` crawls all configured employers and saves jobs and embeddings.
- `make scrape-backfill` prepares missing vectors for an existing catalog without crawling.
- `make scrape-test NAME="Employer Name"` limits the crawl to one employer.
- `make scrape-core` runs core sources only.
- `make scrape-validate` checks source configuration.
- The local API exposes catalog and sync endpoints. It does not expose profiles or candidate evaluations.

The API permits token-free requests only from loopback clients with no `Origin`
header (local CLI tools), or the exact local dashboard origins
`http://localhost:5173` and `http://127.0.0.1:5173`. Untrusted browser origins
are rejected before catalog reads or sync execution, including simple POSTs
that do not need a CORS preflight.

For an external dashboard, set `JOBPULSE_ALLOWED_ORIGIN` to its exact origin
(scheme, hostname and optional port, without a path or trailing slash) and set
`JOBPULSE_API_TOKEN`. Send the token as `Authorization: Bearer <token>`.
Setting a token requires it for all protected requests, including local clients;
external origins and non-loopback clients cannot use token-free access. Origin
checks apply even with a valid token. Health/version endpoints remain public.
Wildcard tunnel domains are never trusted implicitly.

## Safety

The scraper service role key stays in the local process. Candidate records remain behind Supabase RLS. Deduplication transfers user statuses and evaluations through the service-only database RPC before deleting a duplicate. Age, an empty crawl or source failure never authorizes vacancy deletion. The retired `--prune-only` command is rejected; the old SQL pruning RPC is retained only as a no-op for deployed callers. The scraper never returns candidate data in API responses.

Full sync responses retain `prune_stats: {}` for compatibility with existing consumers;
there is no pruning phase. New retirement behavior requires source-specific closure
evidence, preservation of candidate tracking and regression tests. See
[Regression Prevention](REGRESSION_PREVENTION.md).

Run `make scrape-lint` and `make scrape-unit` after changes to this service.

## Full description ingestion

Ingestion retrieves missing posting details by default and preserves complete API
bodies rather than listing snippets. Failed detail requests cannot erase a stored
body, and new metadata-only listings are not embedded. The catalog repair command
updates descriptions in place, preserving job IDs and candidate tracking. Job
embeddings cover the complete body through token windows. See
[Published job descriptions and semantic coverage](OPERATIONS.md#published-descriptions)
for repair commands, body-gate limits and unresolved-source handling.

## Employer metadata and vacancy locations

Employer identity resolution uses exact case-insensitive database names with literal
wildcard escaping and rejects ambiguous matches. Explicit curated aliases may resolve
known companies; no substring identity search or public geocoding runs during ingestion.
Failed persistence never caches an employer without an ID.

Employer headquarters remain in `employers`; published vacancy locations stay in `jobs`.
Ingestion accepts only complete, finite posting coordinate pairs, preserves zero values,
and writes `coordinate_source='posting'`. Legacy coordinates remain stored with unknown
provenance and are hidden in paginated results and deep-link details.

`employers.metadata_source` distinguishes `curated`, `watchlist`, `verified`, and
`unverified` metadata. Trusted `employers.sector` values define the single public
catalog domain; unknown and historical inferred values contribute `Uncategorized`.
Overview `categories` and page `p_domain` share this definition. `sectors` and
`p_sector` remain database compatibility aliases. Candidate role-domain assessments
remain private scoring inputs; this display classification does not rewrite them.
Match averages include assessed jobs only.

After persistence, a bounded employer-office worker researches distinct company/place
pairs and saves additive addresses, coordinates and website/category evidence. It uses
persistent retry dates rather than repeating research for each vacancy. The map's
separate office layer labels workplaces as unconfirmed; vacancy facts remain independent.
See [employer office enrichment](OPERATIONS.md#employer-research-and-offices).

After persistence, when `GEOAPIFY_API_KEY` is configured, the synchronization runner
checks up to 100 pending job locations through a separate bounded verification stage.
It caches external results, records each job's original location and precision, and
never substitutes employer headquarters. Provider failures do not roll back ingestion.
See [job location verification](OPERATIONS.md#vacancy-location-verification).

`make scrape-backfill-employers` is read-only by default. Set `ARGS="--apply --limit 100"`
to link a bounded scan. It uses ID keyset pagination, counts unresolved rows toward the
limit, and guards writes against concurrent company/link changes. It never substitutes
headquarters or increments scoring generations.

Employer linking and metadata enrichment are separate operations. Run
`cd services/scraper && uv run --locked python tools/enrich_employers.py --report /tmp/employers.csv`
to preview all unverified employer records, including those already referenced by jobs.
Use `--apply` to persist the reviewed registry; `--limit N` bounds scanned records.
Updates preserve the existing employer ID and compare its ID, name and metadata source
before writing. A concurrent upgrade or rename is reported as a conflict. Unknown
identities and placeholder employers remain unresolved in the report. No jobs, candidate
data, coordinates from postings, vectors or scoring generations are changed.

`config/employer_evidence.json` records explicit full aliases, first-party evidence URLs
and review dates for additions to the curated registry. Only documented employer addresses
are supplied; conflicting addresses and coordinates without evidence stay null. Employer
coordinates are separate from posting coordinates. Do not assign a hiring platform's
industry to vacancies belonging to its clients. Automatic employer research remains outside ingestion; extending company coverage
requires reviewed identity and field evidence. Vacancy geocoding runs separately
after persistence when the backend key is configured.

To reconcile using the live database only, add `--database-only`. This mode does not
use the external-source registry or fetch any websites. It matches trusted employer
records using punctuation and legal suffix differences, retaining geography and
business-unit names, and rejects conflicting trusted sectors. Optional
`--stored-evidence PATH` accepts reviewed employer self-descriptions from stored jobs:
each JSON record supplies `employer_name`, `sector`, `job_id`, `description_sha256`,
`excerpt` and `reviewed_on`. The job must still belong to that employer, its company
name must match, and its complete body hash and excerpt must remain unchanged.
These records are explicit evidence reviews, not automatic role-keyword classifications.
Keep operational witnesses with the ignored recovery snapshot and retain the outcome report.

Reviewed witnesses can also supply an optional `description`, which must be an exact
substring of the validated business excerpt. Unsupported description claims are rejected.
Explicitly named Community Employment programmes can be individually reviewed as
programme sponsors, with a stored placement witness; this does not classify their
client organisations or introduce an automatic name-based classification rule.
Database-only repairs clear unsupported legacy employer location, coordinates and
website fields before marking that employer metadata verified. They retain only the
reviewed business description, when supplied, rather than promoting legacy guesses.
Vacancy records and coordinates remain untouched. Platform/account labels that contain
postings for multiple hiring companies require separate job identity repairs; never
apply one posting's industry to every vacancy in such an account.

For proven historical headquarters substitutions, `tools/repair_employer_locations.py`
reads only the public catalog section of the approved pre-enrichment snapshot. Supply
`--snapshot PATH --report PATH` to review proposed restorations, then `--apply` to perform
identity/location compare-and-set writes. It refreshes scoring documents/hashes through
`prepare_embeddings`; a retry refreshes already restored matching facts too. No private
snapshot data is imported or used as fixtures.

## External company research

`tools/research_employers.py` reads linked employer identities from stored JobsIreland
and WhatJobs catalog rows, independently of job-board availability. Provider access
and the response cache live in `pipeline/company_research.py`; Wikidata supplies
company discovery and Geoapify supplies explicit street-address geocoding. Results
are review proposals, never ingestion-time industry or vacancy-location inference.
Reviewed metadata can be previewed/applied through `tools/enrich_employers.py --registry`.
See [the operational guide](OPERATIONS.md#employer-research-and-offices) for configuration and evidence rules.
