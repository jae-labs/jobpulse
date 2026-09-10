# Performance & Scalability Architecture

JobPulse is designed to scale to hundreds of thousands of open opportunities and thousands of concurrent candidates
without performance degradation.

## Scalability Challenges & Solutions

### 1. In-Memory Catalog vs. Server-Side Pagination

| Strategy | Catalog Size | Initial Transfer | Browser Memory | Scalability Ceiling |
| :--- | :--- | :--- | :--- | :--- |
| **Legacy In-Memory (`useJobsQuery`)** | 5,000 jobs | ~2.5 MB | ~35 MB | ~10,000 jobs (UI freezes, OOM risks) |
| **Server-Side RPC (`useJobsPageQuery`)** | 100,000+ jobs | ~25 KB (40 items) | < 2 MB | **Unlimited** (O(1) client footprint) |

- **Recommendation**:
  Phased deprecation of `useJobsQuery`'s `fetchAllRows` loop. Use `useJobsPageQuery` everywhere in `JobsView`, and
  use server-side search directly in `CommandMenu.tsx` instead of loading all jobs into memory when pressing `Cmd+K`.

### 2. Overview Metric Server Aggregation (`get_overview_metrics`)

- Computing funnel distributions across 50,000 jobs on the client requires parsing thousands of JSON rows.
- The `get_overview_metrics` PostgreSQL RPC computes category histograms, score distributions, and top skills
  in a single server pass in < 50ms, returning a lightweight ~2KB JSON response.

### 3. List Virtualization (`@tanstack/react-virtual`)

- Rendering thousands of DOM nodes causes memory bloat and scroll stutter.
- JobPulse uses `@tanstack/react-virtual` to ensure only visible job cards in the viewport (typically 10-15 nodes)
  are rendered in the DOM tree, keeping scroll framerates at a constant 60 FPS.

### 4. Production Code-Splitting & Bundle Optimization

Vite bundle chunking is configured in `vite.config.ts` via `manualChunks`:

- **`vendor`**: Core React runtime and routing (~215 KB).
- **`supabase`**: Supabase authentication and database client (~214 KB).
- **`query`**: TanStack Query cache management (~39 KB).
- **`dnd`**: Drag-and-drop sortable engine for dashboard widgets (~54 KB).
- **`index`**: Pure application logic and UI components. Its exact compressed size is intentionally not documented;
  inspect the production build output when assessing bundle changes.
- **Lazy Visualizations**: Heavy Recharts dependencies are dynamically imported on demand (`React.lazy`),
  preventing chart libraries from blocking the initial page paint.

### 5. Realtime Change Event Debouncing

When background ingestion processes insert hundreds of job records simultaneously, PostgreSQL change-data-capture
(CDC) emits a high-frequency burst of WebSocket messages.

- The client wraps query invalidations in a debounced scheduler (`debouncedInvalidate` with a 750ms window).
- This coalesces bursts of 100+ row events into a single query cache invalidation, preventing network storms.
