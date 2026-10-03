# Job map and location verification

Opportunities supports List, Split and Map. Map pins come from the entire filtered
server catalog, independently of the loaded list page. Coordinate groups are bounded at 2,000 per filtered catalog query. The map starts
framed over Ireland. Panning and zooming do not refetch job locations or alter groups;
filter changes and explicit catalog invalidation refresh map data. Circle area scales
with job count, with minimum/maximum sizes for legibility. Selecting a pin opens a role/company browser beside the map (below it on
mobile), with up to five examples. A named-location action browses every matching
job in pages of 20; active domain, search, salary, match and status filters remain
applied. A coarse group can contain several locations, so each sample location has
its own explicit browsing action. Raw database IDs are never action labels. Filters use
the same shared catalog domains and caller-owned matching/status contract as the list.

The optional **Company offices** layer shows a fresh unique directory-discovered
company address for a verified city/district posting. It explicitly marks the workplace
as unconfirmed and preserves the default **Posting locations** layer. Multiple offices,
remote roles and country-only postings receive no office estimate. See
[office enrichment](EMPLOYER_OFFICE_ENRICHMENT.md).

Posting-location pins verify the **place named in the stored posting**, not the employer's headquarters
or an independently proven exact workplace. The location browser states precision, including
city, county and country centroids. Remote, ambiguous and unresolved locations remain
visible in coverage totals without invented coordinates.

## Backend operations

Configure `GEOAPIFY_API_KEY` in the scraper environment or backend `.env`. Never expose
it through `VITE_` variables, reports or Git. Preview before applying:

```sh
cd services/scraper
uv run --locked python tools/verify_job_locations.py --limit 100 \
  --report ../../.backups/job-locations-preview.json
uv run --locked python tools/verify_job_locations.py --apply --limit 100 \
  --report ../../.backups/job-locations-applied.json
```

The worker scans jobs by ID, skips unchanged persisted outcomes, and uses a 30-day
provider cache. Each job receives its own provenance record even when multiple jobs
reuse one location lookup. Up to 100 pending jobs are checked after each synchronization
when the key is present. Changing the posting location invalidates previous verification.
The service-only write RPC checks the original text to avoid overwriting a concurrent
scrape. Reports record conflicts and provider failures; five failures stop the batch.
A shared local budget caps Geoapify attempts at 2,500 per UTC day. Other applications
using the same account are outside this counter.

The browser uses MapLibre GL JS with GPU-rendered job circles and OpenFreeMap vector
basemaps. Navy water, slate land and blue points use application CSS tokens. The
MapLibre worker is bundled by Vite and served from the site origin. Provider attribution
remains visible. OpenFreeMap's public service needs no API key; it has no SLA.
A custom `VITE_MAP_STYLE_URL` requires exact style, tile, font and sprite origins in
both CSP policies (`index.html` and `public/_headers`), including `connect-src` and
`img-src`. Do not hotlink Rezi's basemap or job tiles, or prefetch offline tiles.

The camera starts over Ireland and supports fractional animated zoom. Reduced-motion
preferences disable camera transitions. Same-scope query refreshes keep existing
GPU dots until the replacement response arrives; query errors and identity/filter
changes clear them. Keyboard-accessible group buttons appear only when focused; there is no group
dropdown. When WebGL is unavailable, users can return to list view. The location panel shows roles and companies,
with bounded pagination for the selected location. Pins retain their verified precision;
city-level geocoding does not establish an employer's street address.

## Hosted backfill on 2026-10-03

All 9,012 stored jobs were checked: 8,589 verified places, 263 ambiguous, 106 unresolved
and 54 remote. Only 52 distinct location strings needed consideration; cache reuse
keeps the provider request count much smaller than the number of job records.
No employer headquarters were used for job pins.

The shared domain pass assigned 1,859 JobsIreland CE programme vacancies to
Community Employment & Training using exact named sponsor evidence. This describes
the programme domain, not a claim about the sponsor's legal industry or address.
There remain 2,742 Uncategorized jobs requiring company evidence or identity repair.
Wikidata discovery was blocked with HTTP 403; those employers were not guessed.
All jobs already have an employer link, which does not itself establish a verified domain.

The two forward migrations were applied to hosted Supabase. Frontend changes remain
in the repository until deployed; hosted database changes and web deployment are
separate release steps.

The live precision audit on 2026-10-03 found 6,610 city-level jobs, 1,973 country-level
jobs, six street-level jobs and 423 without verified coordinates. Employer research
and vacancy geocoding are separate: company headquarters do not prove a job location.
More precise workplace pins require a posting-specific address or matching office
evidence before replacing a city/country centroid.
