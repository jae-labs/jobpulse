# SQL capacity probe — 1 October 2026

Measured locally in the disposable Supabase Docker database, PostgreSQL 17.6. Each catalog size used 1,000 synthetic authorized profiles, 1.5 million evaluation rows, and 384-dimensional vectors. SQL ran with authenticated-role claims for randomly selected synthetic owners. Each scenario ran for five seconds; all transactions succeeded. These short probes exclude HTTP, pool limits, network, cold caches, browser rendering and simultaneous background scoring. They are regression evidence, not hosted SLO certification.

| Catalog jobs | Clients | Scenario | p50 transaction | p95 transaction | Transactions |
| --- | --- | --- | --- | --- | --- |
| 9,000 | 10 | jobs | 72.9 ms | 88.2 ms | 685 |
| 9,000 | 10 | search | 78.9 ms | 94.8 ms | 635 |
| 9,000 | 10 | filter | 45.5 ms | 57.1 ms | 1,081 |
| 9,000 | 10 | overview | 30.7 ms | 39.3 ms | 1,589 |
| 30,000 | 50 | jobs | 511.3 ms | 970.7 ms | 439 |
| 30,000 | 50 | search | 499.0 ms | 630.6 ms | 530 |
| 30,000 | 50 | filter | 348.5 ms | 496.0 ms | 737 |
| 30,000 | 50 | overview | 265.0 ms | 358.5 ms | 955 |

A slice of 100 scores took 38.0 ms at 9k and 35.6 ms at 30k. A scheduler tick processed 5,000 scores in 0.90 seconds at 9k and 1.51 seconds at 30k. It is capped at 50 slices, checks a five-second deadline between slices, and has an eight-second cron statement timeout. Exact ranking has a stable job-ID tie break. The rollback-only regression suite independently confirms a full 1,500-item shortlist, no synchronous tenant scoring during ingestion, missing-vector recovery and tenant failure isolation.

An initial 1,000-profile wave can require 1.5 million scores. The observed single-worker rate suggests several minutes under this synthetic workload; competition with reads, model distribution and hosted compute can extend that substantially. Catalog refreshes reuse unchanged factors and score only new/changed shortlisted jobs. Monitor queue age and read latency together before adding service workers. A 1,000-user product does not imply 1,000 simultaneous active clients.

## Reproduction

Create a separate disposable Supabase project named `jobpulse-benchmark` using unused ports, apply this checkout's migrations, then run:

```bash
node scripts/benchmark-database.mjs jobpulse-benchmark
```

The script accepts only that project or the task-specific `jobpulse-cte-verification` project and rejects remote Docker sockets. It pauses the scoring cron through its supported owner API, uses uniquely prefixed synthetic fixtures, validates nonempty query results, cleans up its records, and restores the cron in `finally`. It does not accept hosted URLs or production keys. Run it on a disposable stack because interruption can leave synthetic fixtures or the cron paused; discard that stack after the probe.

The existing 9,012-job hosted catalog still needs a production load test that respects the project's connection and compute budgets before a wider launch. The observed local 30k/50-client p95 catalog request is already near one second, so monitor it before raising concurrency.
