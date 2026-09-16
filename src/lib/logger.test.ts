import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportError, setErrorReporter, initGlobalErrorLogging } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('routes errors to custom reporter when registered', () => {
    const customReporter = vi.fn();
    setErrorReporter(customReporter);

    const testError = new Error('Test failure');
    reportError(testError, { section: 'auth' });

    expect(customReporter).toHaveBeenCalledTimes(1);
    expect(customReporter).toHaveBeenCalledWith(testError, { section: 'auth' });

    // Clean up
    setErrorReporter(() => {});
  });

  it('captures window error and unhandled rejection events', () => {
    const customReporter = vi.fn();
    setErrorReporter(customReporter);

    initGlobalErrorLogging();

    const errorEvent = new ErrorEvent('error', {
      error: new Error('Window uncaught error'),
      message: 'Uncaught Error',
    });
    window.dispatchEvent(errorEvent);

    expect(customReporter).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Window uncaught error' }),
      expect.objectContaining({ source: 'window.onerror' })
    );

    // Clean up
    setErrorReporter(() => {});
  });
});
