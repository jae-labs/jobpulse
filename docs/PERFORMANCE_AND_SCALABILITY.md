# Performance and Scalability

This document describes the current implementation. The repository does not contain a representative concurrent load
test or published production latency measurements. Catalog size and concurrency limits are therefore unverified.

A single-session local Docker probe on 24 September 2026 inserted 100,000 synthetic jobs inside a rolled-back
transaction. `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)` measured 99 ms for a 40-item `get_jobs_page` request and
90 ms for `get_overview_metrics`. The respective plans used about 2,066 and 3,156 temporary blocks read. These
figures describe one developer machine with a synthetic, uniform catalog and no competing traffic. They are not
production latency estimates or capacity evidence; the temporary I/O is a reason to measure sort and aggregate
cost under realistic filters and concurrency.

## Current read path

- `useJobsInfiniteQuery` requests 40 rows at a time from `get_jobs_page`; `useJobsPageQuery` caps a request at 100 rows.
  Both use offset pagination. TanStack Query retains fetched pages in the browser until the query is removed.
- `get_jobs_page` joins jobs with candidate evaluations and statuses, filters and sorts the result, and computes an
  exact total for every request. A small response does not guarantee a small database scan or sort.
- `get_overview_metrics` computes dashboard aggregates in PostgreSQL. Its latency depends on catalog size, indexes,
  concurrent load, and the query plan; no latency target has been verified in this repository.
- `@tanstack/react-virtual` limits mounted job cards to those near the viewport. It does not cap retained query data
  or database work. Chart components are loaded on demand.
- The discovered-location menu reports counts only for loaded, currently filtered results. Fixed regional choices
  remain available independently. Those local counts are not global catalog facets.
- The jobs RPC rejects search and location terms over 80 characters and treats `%` and `_` literally. This prevents
  wildcard amplification, but it does not eliminate the exact count and sort cost for broad legitimate searches.
- The frontend does not subscribe to catalog changes. TanStack Query refetches stale active queries when the window
  regains focus; the header's **Refresh data** button invalidates and refetches active queries on demand. Mutations
  invalidate affected queries. Catalog updates may therefore remain unseen while a candidate keeps the page open
  and in focus without refreshing.

## Before scaling a public invite-only rollout

1. Establish a representative catalog, candidate count, job-update rate, and peak concurrent-session target.
2. Benchmark `get_jobs_page` and `get_overview_metrics` with `EXPLAIN (ANALYZE, BUFFERS)` for common filters,
   broad search, deep pages, and concurrent sessions. Record p50/p95/p99 latency, rows examined, and database CPU.
3. Use the results to choose indexes or a dedicated search/read model. Evaluate seek pagination, bounded or
   approximate counts, and precomputed metrics where their measured cost warrants them.
4. Measure data freshness during a representative catalog update burst and normal user sessions. If the product
   needs automatic updates while a page stays in focus, evaluate bounded polling or coarse catalog-version
   notifications with a measured API budget.
5. Measure browser memory after many pages are loaded, initial bundle transfer, and interaction responsiveness on
   lower-end mobile devices. Run the test again after query or cache changes.

Bundle sizes and performance numbers should be reported from a named build, dataset, device, and test date rather
than presented here as fixed properties of the architecture.
