import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/react';
import { initSentry, setSentryUser, isSentryInitialized, _resetSentryForTesting } from './sentry';
import { reportError, setErrorReporter } from './logger';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

describe('sentry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    _resetSentryForTesting();
    setErrorReporter(() => {});
  });

  afterEach(() => {
    _resetSentryForTesting();
  });

  it('does not initialize when DSN is absent', () => {
    initSentry('');

    expect(isSentryInitialized()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with default DSN when no parameter is passed', () => {
    initSentry();

    expect(isSentryInitialized()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://9486ce21bcd546a289bd1fde16c21ca5@o4511447382163456.ingest.de.sentry.io/4512098245607504',
        enabled: true,
      })
    );
  });

  it('initializes and routes reportError to Sentry when DSN is present', () => {
    initSentry('https://fake@o123.ingest.sentry.io/456');

    expect(isSentryInitialized()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://fake@o123.ingest.sentry.io/456',
        enabled: true,
      })
    );

    const testError = new Error('Test Sentry exception');
    reportError(testError, { area: 'test' });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(testError, {
      extra: { area: 'test' },
    });
  });

  it('sets user context when Sentry is initialized', () => {
    initSentry('https://fake@o123.ingest.sentry.io/456');

    setSentryUser('auth-uid-123');
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'auth-uid-123' });

    setSentryUser(null);
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });

  it('ignores setSentryUser if Sentry is not initialized', () => {
    setSentryUser('auth-uid-123');
    expect(Sentry.setUser).not.toHaveBeenCalled();
  });
});
