import * as Sentry from '@sentry/react';
import { setErrorReporter } from './logger';

let isInitialized = false;

/** Allow only diagnostic structure. Free text, request data and scope can contain PII. */
export function sanitizeErrorEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: 'javascript',
    level: event.level,
    environment: import.meta.env.MODE,
    exception: {
      values: event.exception?.values?.map(exception => ({
        type: ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'].includes(exception.type ?? '') ? exception.type : 'Error',
        value: 'Application error',
        stacktrace: {
          frames: exception.stacktrace?.frames?.map(frame => ({
            // Keep static bundled asset names only; paths and query strings can identify users.
            filename: frame.filename?.match(/\/(assets\/[-\w.]+\.js)(?:[?#]|$)/)?.[1] ?? '[redacted]',
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}

/** Explicit deployment configuration; no fallback project or development collection. */
export function initSentry(dsnOverride?: string): void {
  const dsn = dsnOverride ?? import.meta.env.VITE_SENTRY_DSN;
  if (isInitialized || !dsn || (!import.meta.env.PROD && dsnOverride === undefined)) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: true,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false }, databaseQueryData: false,
      queues: false, stackFrameVariables: false, frameContextLines: 0,
    },
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeErrorEvent,
    beforeSendTransaction: () => null,
  });
  Sentry.setUser(null);
  isInitialized = true;
  setErrorReporter(error => { Sentry.captureException(error); });
}

export function _resetSentryForTesting(): void { isInitialized = false; }
