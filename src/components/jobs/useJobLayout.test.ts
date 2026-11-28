import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useJobLayout } from './useJobLayout';

afterEach(() => vi.unstubAllGlobals());
it('defaults to list on compact screens and uses Map as a list/map toggle', () => {
  let compact = true;
  let notify = () => {};
  vi.stubGlobal('matchMedia', () => ({ matches: compact,
    addEventListener: (_event: string, callback: () => void) => { notify = callback; }, removeEventListener: vi.fn() }));
  const { result } = renderHook(useJobLayout);
  expect(result.current.layoutMode).toBe('list');
  act(() => result.current.toggleMap());
  expect(result.current.layoutMode).toBe('map');
  act(() => result.current.toggleMap());
  expect(result.current.layoutMode).toBe('list');
  act(() => result.current.setLayoutMode('split'));
  expect(result.current.layoutMode).toBe('list');
  act(() => { compact = false; notify(); });
  expect(result.current.layoutMode).toBe('split');
  act(() => result.current.toggleMap());
  act(() => result.current.toggleMap());
  expect(result.current.layoutMode).toBe('map');
  act(() => { compact = true; notify(); });
  expect(result.current.layoutMode).toBe('map');
});
