# Performance & Scalability

## 1. Read Path Optimization & Server State

- `useJobsInfiniteQuery` fetches 40 opportunities per page through `get_jobs_page`.
- `@tanstack/react-virtual` renders visible job cards only, keeping DOM node count constant regardless of catalog depth.
- TanStack Query caches catalog pages (`staleTime: 2m`) and invalidates them selectively via the `queryKeys` factory after mutations.
- Overview charts load on demand via code-split lazy imports (`React.lazy`). Document downloads use short-lived signed URLs.

## 2. Main-Thread & Rendering Performance

- Read theme variables through `getCachedCssVar` in [chartTheme.ts](../src/lib/chartTheme.ts), not computed-style reads during render. Cache misses read computed styles synchronously; resolved values are reused until root theme attributes change. Avoid repeated reads during rendering.
- Disable Recharts animations (`isAnimationActive={false}`) on multi-chart dashboards so concurrent animation loops do not compete with scrolling.
- Keep virtual-list refs stable by item ID. [JobsView.tsx](../src/components/jobs/JobsView.tsx) owns `getCardRefCallback`; do not copy its implementation into another view. Keep virtualizer option callbacks stable too.
- Overview counts, facets and histograms come from server aggregates, never loaded-page arrays. For necessary local transformations, use single-pass reductions and extract expensive sort keys once.
- Use the cached `formatDate` and `formatNumber` helpers in [i18n.ts](../src/lib/i18n.ts), rather than allocating Intl formatters in renders or loops.
- Preserve memoized cards, inspectors, widgets and charts, with stable handler props. Check rendering with the profiler before adding more memoization.

## 3. Database Query Tuning

- `get_jobs_page` and `get_overview_metrics` filter, score, and aggregate in PostgreSQL.
- Profile saves run a quantized MiniLM model in a dedicated browser worker; the model and WASM assets are staged at build time and served from the site origin. Measure cold download, warm inference, and main-thread responsiveness separately.
- `rescore_user` requests durable work and returns immediately. A statement trigger advances the shared catalog generation without looping through candidates. The backend worker ranks an exact shortlist of at most 1,500 vectors, scores at most 100 changed jobs per call, keeps durable progress, and retries failed tenants with backoff. It uses exact ranking because a bounded HNSW search cannot guarantee 1,500 results. A five-second cron drains at most 50 slices per tick, stops after five seconds of work, and uses an eight-second statement timeout; additional service workers can use `SKIP LOCKED` when measured backlog warrants them. Job-fact hashes include salary and location so those changes refresh cached sub-scores even when the embedding text is unchanged.
- Search and location inputs are capped at 80 characters; wildcards are literal.
- Candidate tracking uses the unique `(user_id, job_id)` index for ownership lookups and a `job_id` index for catalog maintenance.

## 4. Scale Checks & Profiling

1. Check `EXPLAIN (ANALYZE, BUFFERS)` for common `get_jobs_page` filters.
2. Benchmark `rescore_user`, `get_jobs_page` after a weight edit, and the job-vector trigger with a representative 30,000-job catalog and active-profile count before treating the subsecond latency goals as verified.
3. Monitor browser heap and commit-phase times in Chrome DevTools Performance Profiler during rapid virtual list scrolling and first profile embedding.
4. Verify chunk sizes and code-splitting boundaries with `npm run build`.

The build enforces gzip budgets for the complete initial JavaScript import graph
(275 KiB), jobs route (20 KiB), lazy map (300 KiB), map worker (165 KiB), and
inference worker (175 KiB). These prevent regressions; they do not measure parse
time, model transfer, memory, or GPU behavior on a target device.

Infinite catalog pages have no passive polling or focus refresh. Explicit refresh,
mutations and completed scoring revisions invalidate them. Loaded pages remain
available for backward scrolling; do not impose `maxPages` without implementing
previous-page navigation. Inference reuses one sequential worker, releases it after
60 idle seconds, times out a request after 120 seconds, and disposes it on logout
or identity changes. Structured profile fields precede summary text; versioned,
bounded token windows prevent silent tail truncation.
