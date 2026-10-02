import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSourcesQuery } from './useQueries';
import type { Source } from '../types/job';

const from = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { from } }));

describe('complete source catalog', () => {
  it('fetches beyond the REST row cap with stable IDs and rejects partial success', async () => {
    const rows: Source[] = Array.from({ length: 1001 }, (_, index) => ({
      id: index + 1, name: `Example Source ${index}`, url: 'https://example.invalid', mode: 'test',
      last_status: 'idle', last_synced_at: null, detail: null,
    }));
    const gt = vi.fn();
    from.mockImplementation(() => {
      const index = from.mock.calls.length;
      const query = {
        select: () => query, order: () => query, limit: () => query,
        gt: (name: string, cursor: number) => { gt(name, cursor); return query; },
        then: (resolve: (result: { data: Source[]; error: null }) => unknown) =>
          Promise.resolve({ data: index === 1 ? rows.slice(0, 1000) : rows.slice(1000), error: null }).then(resolve),
      };
      return query;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useSourcesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1001);
    expect(gt).toHaveBeenCalledWith('id', 1000);
    unmount();
    from.mockReset();
    const query = {
      select: () => query, order: () => query, limit: () => query, gt: () => query,
      then: (resolve: (result: { data: Source[] | null; error: { message: string } | null }) => unknown) =>
        Promise.resolve(from.mock.calls.length === 1 ? { data: rows.slice(0, 1000), error: null } :
          { data: null, error: { message: 'Synthetic failure' } }).then(resolve),
    };
    from.mockReturnValue(query);
    const otherClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherWrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={otherClient}>{children}</QueryClientProvider>;
    const failed = renderHook(() => useSourcesQuery(), { wrapper: otherWrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    expect(failed.result.current.data).toBeUndefined();
  });
});
