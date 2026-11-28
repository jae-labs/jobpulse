import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useErrorDismissal } from './useErrorDismissal';

describe('view-scoped error dismissal', () => {
  it('preserves dismissal through unrelated renders and reveals a new failure', () => {
    const error = new Error('Synthetic failure');
    const { result, rerender } = renderHook(({ failure }) => useErrorDismissal('jobs', failure), {
      initialProps: { failure: error },
    });
    act(() => result.current.dismiss());
    rerender({ failure: error });
    expect(result.current.isDismissed).toBe(true);
    rerender({ failure: new Error('Synthetic failure') });
    expect(result.current.isDismissed).toBe(false);
  });

  it('reveals the same failure after leaving and returning to its view', () => {
    const error = new Error('Synthetic failure');
    const { result, rerender } = renderHook(({ scope }) => useErrorDismissal(scope, error), {
      initialProps: { scope: 'jobs' },
    });
    act(() => result.current.dismiss());
    rerender({ scope: 'overview' });
    rerender({ scope: 'jobs' });
    expect(result.current.isDismissed).toBe(false);
  });

  it('reveals a repeated failure after it clears, and supports explicit retry', () => {
    const { result, rerender } = renderHook(({ failure }) => useErrorDismissal('profile', failure), {
      initialProps: { failure: 'Synthetic failure' as string | null },
    });
    act(() => result.current.dismiss());
    act(() => result.current.reset());
    expect(result.current.isDismissed).toBe(false);
    act(() => result.current.dismiss());
    rerender({ failure: null });
    rerender({ failure: 'Synthetic failure' });
    expect(result.current.isDismissed).toBe(false);
  });
});
