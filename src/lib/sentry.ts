import * as Sentry from '@sentry/react';
import { setErrorReporter } from './logger';

export const DEFAULT_SENTRY_DSN =
  'https://9486ce21bcd546a289bd1fde16c21ca5@o4511447382163456.ingest.de.sentry.io/4512098245607504';

let isInitialized = false;

/** Initializes the Sentry SDK and registers JobPulse's error reporter. */
export function initSentry(dsnOverride?: string): void {
  const dsn = dsnOverride !== undefined ? dsnOverride : (import.meta.env.VITE_SENTRY_DSN || DEFAULT_SENTRY_DSN);

  if (isInitialized || !dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: Boolean(dsn),
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['apikey'];
      }
      return event;
    },
  });

  isInitialized = true;

  setErrorReporter((error: unknown, context?: Record<string, unknown>) => {
    Sentry.captureException(error, {
      extra: context,
    });
  });
}

/** Associates or clears the authenticated user ID in Sentry context. */
export function setSentryUser(userId: string | null): void {
  if (!isInitialized) return;

  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/** Check if Sentry is currently active */
export function isSentryInitialized(): boolean {
  return isInitialized;
}

/** Reset internal initialization flag for testing */
export function _resetSentryForTesting(): void {
  isInitialized = false;
}
