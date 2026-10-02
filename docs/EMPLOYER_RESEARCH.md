# Employer research from stored vacancies

Run from `services/scraper`. The script reads shared employer IDs from **JobsIreland.ie**
and **WhatJobs Ireland** in the configured Supabase database. It never opens either
job board and never reads candidate data or writes jobs, scores or employer metadata.

```sh
uv run --locked python tools/research_employers.py --source both --limit 50 \
  --report ../../.backups/employer-research.json
```

Company discovery uses [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access)
name search and entity records for official website links, business descriptions and
industry candidates. Exact normalized identities are required; ambiguous matches,
missing evidence and platform/placeholder names remain unresolved. Wikidata is a
discovery source: confirm identity and sector on the linked official company website
before accepting a record. Industry labels may need mapping to existing catalog domains.

For address geocoding, configure `GEOAPIFY_API_KEY` in the backend environment or
backend `.env` (never a `VITE_` variable; never commit the key). Obtain a key from
[Geoapify MyProjects](https://myprojects.geoapify.com/). Then run:

```sh
uv run --locked python tools/research_employers.py --source both --limit 50 \
  --geocode --report ../../.backups/employer-research.json
```

[Geoapify forward geocoding](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/)
is called for company addresses backed by the reviewed official evidence registry,
or a single explicit English street-address claim (P6375) on the exact Wikidata entity.
Wikidata addresses and their geocoding remain proposals: verify them on the official
company website. Unknown companies without a street address require one found on
their official website first. Add that reviewed address to a separate registry and
pass `--registry /path/to/reviewed.json`.
City, street and postcode centroids are rejected. Building/amenity coordinates still
need review of address, alternatives and confidence; employer geography never implies
the vacancy's work location. The report carries provider attribution.

Requests are serial, timed out, spaced by at least one second, retried up to three
times for rate limits/server errors, and cached for 30 days under `.backups/`.
Successful cache entries omit API keys. Reports checkpoint after every employer.
`--company 'Exact stored name'` targets one employer. Provider failures exit nonzero
and remain explicit in the report. Five provider failures stop the batch. `--source all --unknown-only` audits all
unverified linked employers. Geoapify requests share a local 2,500-attempt UTC daily
budget with job geocoding; cache hits consume no attempts. This does not measure
requests made by other applications on the same provider account.

After reviewing proposals, create an evidence registry array following
`services/scraper/config/employer_evidence.json`: name, explicit aliases, sector,
description, website, location (or null), sources and checked_on. Coordinates require
both latitude/longitude plus coordinate_sources included in sources. Include the
official address source and Geoapify endpoint, without a key, for geocoded coordinates.
The raw research report deliberately cannot be applied directly.

Preview reviewed records before applying, and save a recovery snapshot of affected
employers under `.backups/` before the write:

```sh
uv run --locked python tools/enrich_employers.py --registry /path/to/reviewed.json \
  --refresh-verified --report ../../.backups/employer-preview.csv
uv run --locked python tools/enrich_employers.py --registry /path/to/reviewed.json \
  --refresh-verified --apply --report ../../.backups/employer-applied.csv
```

The apply tool guards the existing employer ID, name and metadata source and reports
conflicts/failures. Curated/watchlist records are excluded. This is operational backend
tooling, separate from normal ingestion; it introduces no schema or frontend changes.
