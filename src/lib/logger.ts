const IS_PRODUCTION = import.meta.env.PROD;

type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;
let customReporter: ErrorReporter | null = null;

export function setErrorReporter(reporter: ErrorReporter): void {
  customReporter = reporter;
}

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

  // Keep a console fallback when the reporter fails.
  if (!IS_PRODUCTION || !reported) {
    console.error('[JobPulse]', error, context);
  }
}

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

export function warn(message: string, ...args: unknown[]): void {
  if (!IS_PRODUCTION) {
    console.warn('[JobPulse]', message, ...args);
  }
}
