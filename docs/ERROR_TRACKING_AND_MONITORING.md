# Error Tracking & Monitoring

Application errors flow through `src/lib/logger.ts`, which connects the React error boundary and uncaught-error handlers to an optional Sentry reporter.

## Configuration

Set `VITE_SENTRY_DSN` explicitly for a production build. There is no default DSN. The SDK is loaded asynchronously only for explicitly configured production builds, after invitation parameters are consumed; ordinary development and unconfigured builds do not load it. Enable the integration only after reviewing provider access and retention; the retention ceiling is one year.

## Payload contract

`src/lib/sentry.ts` constructs an allowlisted error event. It retains generic JavaScript error types, bundled static-code filenames and line/column positions, event identifiers, timestamp and environment. Error messages are replaced with a generic description. Arbitrary context, request metadata, headers, URLs, user identifiers, breadcrumbs and attachments are discarded. Initialization clears SDK identity; authentication does not pass account identifiers to telemetry.

SDK data collection, replay and tracing are disabled. Transactions and breadcrumbs are dropped. Do not attach profile data, documents, salary preferences, job URLs, session identifiers or raw exceptions to a second telemetry integration. Synthetic sentinel tests cover the error envelope and must accompany collection changes.

Application code imports `reportError` or development-only `warn` from `src/lib/logger.ts`.
Runtime Sentry imports outside the boundary and common direct console calls fail source
lint. Sanitization remains enforced by event construction and synthetic payload tests;
static lint does not prove that every possible integration is safe. See
[Regression Prevention](REGRESSION_PREVENTION.md) before changing collection behavior.

## Content security policy

The site permits configured Sentry ingest domains in `connect-src`, while Supabase network access is restricted to the configured project origin. An allowlisted network destination does not replace event sanitization.

## Queue monitoring

Candidate scoring has durable progress, retry count and SQLSTATE-only error codes in the backend-only `candidate_scoring_work` table. The caller-scoped progress RPC exposes only that account's state. Check oldest unfinished work, retries and worker execution durations before increasing concurrency. Cron history is pruned daily at 365 days; its results contain counts and generic status rather than candidate content. Never export queue fingerprints or profile vectors into telemetry.
