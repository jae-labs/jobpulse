import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import { initSentry, _resetSentryForTesting, sanitizeErrorEvent } from './sentry';
import { reportError, setErrorReporter } from './logger';
vi.mock('@sentry/react', () => ({ init: vi.fn(), setUser: vi.fn(), captureException: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); _resetSentryForTesting(); setErrorReporter(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
describe('telemetry privacy', () => {
  it('does not collect by default in development', () => { initSentry(); expect(Sentry.init).not.toHaveBeenCalled(); });
  it('does not initialize without a DSN', () => { initSentry(''); expect(Sentry.init).not.toHaveBeenCalled(); });
  it('captures errors without arbitrary context and never associates account IDs', () => {
    initSentry('https://fake@o123.ingest.sentry.io/456');
    const error = new Error('private input'); reportError(error, { email: 'person@example.test' });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(Sentry.setUser).toHaveBeenCalledExactlyOnceWith(null);
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0, dataCollection: expect.objectContaining({ userInfo: false, httpHeaders: false, urlQueryParams: false }) }));
  });
  it('drops PII from all envelope paths and preserves static stack locations', () => {
    const privateValue = 'person@example.test';
    const event: Sentry.ErrorEvent = {
      type: undefined, message: privateValue, user: { email: privateValue, id: privateValue }, extra: { profile: privateValue },
      contexts: { private: { data: privateValue } }, tags: { private: privateValue },
      request: { url: `https://example.test/?invite=${privateValue}`, headers: { authorization: privateValue } },
      breadcrumbs: [{ message: privateValue }],
      exception: { values: [{ type: 'TypeError', value: privateValue, stacktrace: { frames: [
        { filename: 'https://example.test/assets/index-abc.js?email=' + privateValue, lineno: 12, vars: { private: privateValue }, context_line: privateValue },
        { filename: 'https://example.test/users/' + privateValue, function: privateValue },
      ] } }] },
    };
    const clean = sanitizeErrorEvent(event);
    expect(JSON.stringify(clean)).not.toContain(privateValue);
    expect(clean.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: 'assets/index-abc.js', lineno: 12, colno: undefined, in_app: undefined });
    expect(clean.request).toBeUndefined(); expect(clean.user).toBeUndefined();
  });
});
