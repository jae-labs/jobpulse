/**
 * Centralized logging abstraction.
 *
 * In development, logs are forwarded to the browser console.
 * In production, this module can be extended to report errors to
 * an external service (e.g. Sentry, Datadog) by modifying the
 * `reportError` function without touching call sites.
 */

const IS_PRODUCTION = import.meta.env.PROD;

type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;
let customReporter: ErrorReporter | null = null;

/** Register an external production error reporter (e.g. Sentry, Datadog). */
export function setErrorReporter(reporter: ErrorReporter): void {
  customReporter = reporter;
}

/** Report a captured error with optional context metadata. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  let reported = false;
  if (customReporter) {
    try {
      customReporter(error, context);
      reported = true;
    } catch {
      // Prevent recursion
    }
  }

  // Always log to console in non-production, or in production as fallback when no custom reporter is registered
  if (!IS_PRODUCTION || !reported) {
    console.error('[JobPulse]', error, context);
  }
}

/** Register global listeners for uncaught exceptions and unhandled promise rejections. */
export function initGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportError(event.error ?? new Error(event.message), {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason ?? new Error('Unhandled Promise Rejection'), {
      source: 'window.onunhandledrejection',
    });
  });
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
