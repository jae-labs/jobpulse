# Performance & Scalability

## 1. Read Path Optimization & Server State

- `useJobsInfiniteQuery` fetches 40 opportunities per page through `get_jobs_page`.
- `@tanstack/react-virtual` renders visible job cards only, keeping DOM node count constant regardless of catalog depth.
- TanStack Query caches catalog pages (`staleTime: 2m`) and invalidates them selectively via the `queryKeys` factory after mutations.
- Overview charts load on demand via code-split lazy imports (`React.lazy`). Document downloads use short-lived signed URLs.

## 2. Main-Thread & Rendering Performance

High frame rates (60fps) and rapid response to keyboard navigation require strict control over main-thread execution time, layout reflows, and component reconciliation.

### A. Forced Synchronous Layouts & DOM Reflows
- **Rule**: Never call `getComputedStyle(document.documentElement).getPropertyValue(...)` inside component render functions or `useMemo`. When DOM writes are queued, reading computed styles forces a synchronous layout reflow.
- **Pattern**: Use `getCachedCssVar(varName, fallback)` from `src/lib/chartTheme.ts`. It maintains an in-memory cache synchronized with theme changes via a `MutationObserver` on `document.documentElement` (`attributes: ['class', 'data-theme']`). Lookups are $O(1)$ memory reads without DOM reflow.

### B. Chart Animations on Multi-Widget Dashboards
- **Rule**: Multi-chart dashboards (such as `OverviewView`) must set `isAnimationActive={false}` on Recharts elements (`<Bar>`, `<Pie>`, `<Area>`).
- **Rationale**: Recharts defaults to 1500ms ease animations. Four concurrent charts launch four synchronized `requestAnimationFrame` loops on initial mount and tab transitions, causing severe frame drops during scrolling and navigation. Turning animations off yields instantaneous rendering and zero RAF overhead.

### C. Virtualized List & Ref Callback Hygiene
- **Rule**: Never pass inline arrow ref callbacks `ref={(el) => ...}` to elements in a virtual list.
- **Rationale**: React's commit phase calls `ref(null)` followed by `ref(el)` on every render when callback identity changes. In a list of 15–20 visible virtual items, this wipes and repopulates internal maps on every keystroke and scroll event.
- **Pattern**: Cache ref callbacks by item ID using `getCardRefCallback(id)`:
  ```ts
  const cardRefCallbacks = useRef(new Map<number, (el: HTMLButtonElement | null) => void>());
  const getCardRefCallback = useCallback((id: number) => {
    let cb = cardRefCallbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLButtonElement | null) => {
        if (el) cardRefs.current.set(id, el);
        else cardRefs.current.delete(id);
      };
      cardRefCallbacks.current.set(id, cb);
    }
    return cb;
  }, []);
  ```
- **Virtualizer Options**: Wrap `getScrollElement`, `estimateSize`, and `getItemKey` in `useCallback` to prevent the virtualizer from recalculating options on un-related parent re-renders.

### D. Single-Pass Algorithmic Complexity ($O(N)$)
- **Multi-Filter Aggregations**: Do not chain 10–15 separate `.filter()` calls over arrays of jobs to count statuses, salary tiers, and regions. Consolidate them into a single $O(N)$ accumulation pass.
- **Histogram & Bucket Calculations**: Bucket continuous metrics (such as match fit tiers 0–100%) in a single mathematical pass (`Math.floor(rel / 10)`) rather than running 10 separate `.filter()` passes.
- **Sorting with Regex Extraction (Schwartzian Transform)**: If a comparator requires regex matching or date parsing, pre-map the items into a decorated array with extracted numbers/timestamps *before* calling `.sort()`. Cache the extracted values so JSX rendering does not repeat the extraction.

### E. Intl Formatter Allocation Overhead
- **Rule**: Avoid `new Intl.DateTimeFormat()` or `new Intl.NumberFormat()` inside loops or component renders. Formatter instantiation in V8/JavaScriptCore is ~50–100x slower than formatting with a cached instance.
- **Pattern**: `src/lib/i18n.ts` caches formatters by `(locale, optionsKey)` in module-scoped Maps (`dtfCache`, `nfCache`).

### F. Component Memoization & Callback Invariants
- **Memoized Leaves & Containers**: Wrap high-frequency leaf components (`JobCard`, `JobDetailInspector`, `StatusPill`, `MatchScoreBadge`, `StatCard`, `SortableWidget`) and charts (`PipelineChart`, `CategoryBreakdownChart`, `RelevanceDistributionChart`, `SkillsFrequencyChart`) in `React.memo`.
- **Stable Drill-Down Props**: Always wrap event handlers passed down from shell components (`App.tsx`, `OverviewView.tsx`) in `useCallback`. A single unmemoized inline arrow prop will bypass `React.memo` on the child component tree.

## 3. Database Query Tuning

- `get_jobs_page` and `get_overview_metrics` filter, score, and aggregate in PostgreSQL.
- Profile saves run a quantized MiniLM model in a dedicated browser worker; the model and WASM assets are staged at build time and served from the site origin. Measure cold download, warm inference, and main-thread responsiveness separately.
- `rescore_user` requests durable work and returns immediately. A statement trigger advances the shared catalog generation without looping through candidates. The backend worker ranks an exact shortlist of at most 1,500 vectors, scores at most 100 changed jobs per call, keeps durable progress, and retries failed tenants with backoff. It uses exact ranking because a bounded HNSW search cannot guarantee 1,500 results. A one-second cron drains at most 50 slices per tick, stops after five seconds of work, and uses an eight-second statement timeout; additional service workers can use `SKIP LOCKED` when measured backlog warrants them. Job-fact hashes include salary and location so those changes refresh cached sub-scores even when the embedding text is unchanged.
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
