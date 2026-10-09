import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useJobFilters } from './useJobFilters';
import type { ReactNode } from 'react';

describe('job filter URL contract', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
  it('keeps explicit neutral selections over initial view defaults', () => {
    const { result } = renderHook(() => useJobFilters({ initialStatusFilter: 'applied', initialSectorFilter: 'Engineering', initialMinMatch: 80 }), { wrapper });
    act(() => result.current.setStatusFilter('all'));
    act(() => result.current.setSectorFilter('all'));
    act(() => result.current.setMinMatch(0));
    expect(result.current.queryParams).toMatchObject({ status: 'all', sector: 'all', minMatch: 0 });
    act(() => result.current.resetFilters());
    expect(result.current.queryParams).toMatchObject({ status: 'all', sector: 'all', minMatch: 0 });
  });
  it('rejects malformed URL filters and IDs without issuing invalid RPC arguments', () => {
    const invalidWrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/?status=unknown&match=Infinity&job=-1']}>{children}</MemoryRouter>;
    const { result } = renderHook(() => useJobFilters(), { wrapper: invalidWrapper });
    expect(result.current.queryParams).toMatchObject({ status: 'all', minMatch: 0 });
    expect(result.current.urlJobId).toBeNull();
  });
  it('defaults to active browsing, retains history, and persists explicit availability', () => {
    const { result } = renderHook(() => useJobFilters(), { wrapper });
    expect(result.current.queryParams.availability).toBe('active');
    act(() => result.current.setStatusFilter('saved'));
    expect(result.current.queryParams.availability).toBe('all');
    act(() => result.current.setAvailability('unverified'));
    expect(result.current.searchParams.get('availability')).toBe('unverified');
    act(() => result.current.setStatusFilter('applied'));
    expect(result.current.queryParams.availability).toBe('unverified');
    act(() => result.current.resetFilters());
    expect(result.current.queryParams.availability).toBe('active');
  });

});
