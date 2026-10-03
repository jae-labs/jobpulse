# Employer office enrichment

After each scrape, the Python runner researches up to 25 distinct employer/location
pairs when the backend `GEOAPIFY_API_KEY` is configured. It uses Geoapify boundary
geocoding, named Places searches and Place Details, without ChatGPT or another LLM.
The [Places API](https://apidocs.geoapify.com/docs/places/) allows persistent caching;
[Place Details](https://apidocs.geoapify.com/docs/place-details/) supplies website
metadata where the underlying OpenStreetMap record has it.

`employers` remains the company identity and trusted industry registry.
`employer_offices` stores multiple additive public company places with their provider
place ID, numbered street address, city/country, latitude/longitude, website/domain,
provider categories, source attribution and last check time. Missing websites stay
unknown. Website domain is a hostname; industry domain remains the trusted employer
sector. Provider categories support research and review, but never automatically
replace a verified sector or a candidate's private role classification.

`employer_office_lookups` is backend-only durable scheduling state, keyed by employer
and original posting location. PostgreSQL supplies a bounded distinct worklist and
checks unchanged company identity and a current matching job before persisting.
Fresh successful searches are reused for 180 days, unresolved/ambiguous/remote results
for 30 days, and provider failures for one day. New company/location combinations
become eligible immediately. Provider failures never erase existing offices or fail
an already completed scrape. Five provider failures stop a batch.

Discovery requires an exact normalized business name, a numbered street address and
finite coordinates; when both websites are known their hostnames must agree. Name
normalization permits punctuation and legal suffix differences, not substring matches.
Ambiguous boundaries, placeholders, remote jobs and truncated business searches are
not assigned an office. Multiple matching offices are all retained. This is directory
evidence, not a guarantee of company identity or the workplace for a particular role.
Smaller employers and offices without OpenStreetMap records may remain unresolved.

The worker makes at most two discovery requests plus five details requests per pair.
A 30-day local HTTP cache reuses identical requests across employers. All Geoapify
requests share the existing conservative 2,500-attempt UTC daily budget and retries.
The counter is local to this checkout; it is not a cross-machine account quota.
API keys remain in the backend environment and never enter reports or browser code.
Company searches allow 60 seconds for a response, with a 10-second connection limit,
because provider boundary searches can exceed 20 seconds even when successful.

## Operating the worker

Apply the forward migrations before running the worker. Preview is read-only at the
database; it still calls the provider and populates the HTTP cache:

```sh
cd services/scraper
uv run --locked python tools/enrich_offices.py --limit 25 \
  --report ../../.backups/employer-offices-preview.json
uv run --locked python tools/enrich_offices.py --apply --limit 25 \
  --report ../../.backups/employer-offices-applied.json
```

Or use `make scrape-enrich-offices ARGS="--apply --limit 25 --report /tmp/offices.json"`.
Successful apply runs persist both findings and retry dates. Reports contain only
public company/place metadata and outcome counts. Do not commit provider caches.

## Map behavior

The map has separate Posting locations and Company offices layers. Posting location
verification and job coordinates remain independent of company places. The office
layer shows a discovered office only when exactly one office matches a fresh lookup
for that employer and the original posting location, and the posting has a verified
city/district location. Country-only jobs, remote roles, multiple offices and stale
lookups do not receive an office pin. No worldwide headquarters substitution occurs.

Office groups honor the complete server catalog filters and each caller's own
scores/status/bookmarks. They use the existing bounded grouping and five-role previews.
The visible precision label says the workplace is unconfirmed. Changing layers clears
selection and GPU scope; an office pin does not auto-navigate to a coarse city on mobile.
The city browsing action still refers to the published posting location.

The default is Posting locations. Company offices is an explicit directory-evidence
view; neither its coordinates nor its categories change scoring inputs or vacancy facts.

## Verification and release

`test_employer_offices.py` covers identity mismatches, coordinates, remote/ambiguous
places, multiple offices and independent-stage failures. `tenant_employer_offices.sql`
checks two authorized members, denied identities, backend-only writes/worklists, stale
identity guards, additive persistence, map score isolation, expiry and multi-office
exclusion. Map UI and response validation tests cover the layer switch and precision.

Apply local and hosted migrations separately. Local verification is not hosted provider
coverage or a deployed frontend. The hosted stack needs both forward migrations before
regular synchronization can persist office discovery.
