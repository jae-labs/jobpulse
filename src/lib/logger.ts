/**
 * Centralized logging abstraction.
 *
 * In development, logs are forwarded to the browser console.
 * In production, this module can be extended to report errors to
 * an external service (e.g. Sentry, Datadog) by modifying the
 * `reportError` function without touching call sites.
 */

const IS_PRODUCTION = import.meta.env.PROD;

/** Report a captured error with optional context metadata. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  // TODO: Replace with Sentry.captureException(error, { extra: context })
  // when an error reporting service is integrated.
  if (!IS_PRODUCTION) {
    console.error('[JobPulse]', error, context);
  }
}

/** Log a warning that is relevant in development but suppressed in production. */
export function warn(message: string, ...args: unknown[]): void {
  if (!IS_PRODUCTION) {
    console.warn('[JobPulse]', message, ...args);
  }
}

/** Log informational messages in development only. */
export function info(message: string, ...args: unknown[]): void {
  if (!IS_PRODUCTION) {
    console.info('[JobPulse]', message, ...args);
  }
}
