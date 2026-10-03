import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useUpdateJobSavedMutation, useUpdateJobStatusMutation } from './useJobQueries';
import { queryKeys } from '../lib/queryKeys';
import type { Job } from '../types/job';

vi.mock('../lib/userSession', () => ({ getCurrentUserId: async () => 'a' }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: { message: 'Offline' } }) }) },
  getAccountClient: async () => ({ rpc: async () => ({ error: { message: 'Offline' } }) }),
}));
const job: Job = { id: 1, title: 'Synthetic role', company: 'Example', location: 'Dublin',
  employment_type: 'Permanent', salary_text: null, url: 'https://example.test/job', source: 'test',
  status: 'new', relevance: 0, matched_skills: [], last_seen_at: '2026-10-03', is_saved: true };

describe('offline mutation recovery', () => {
  it('preserves membership, offsets and detail when overlapping status/bookmark writes fail', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const pageKey = queryKeys.jobsPage('a', { status: 'saved' });
    const searchKey = queryKeys.jobsSearchPage('a', { status: 'new' });
    const detailKey = queryKeys.jobById(1, 'a');
    const page = { items: [job], total: 1 };
    const infinite = { pages: [page], pageParams: [0] };
    client.setQueryData(pageKey, infinite);
    client.setQueryData(searchKey, page);
    client.setQueryData(detailKey, job);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ status: useUpdateJobStatusMutation('a'), saved: useUpdateJobSavedMutation('a') }), { wrapper });
    await act(async () => {
      await Promise.allSettled([
        result.current.status.mutateAsync({ job, status: 'applied' }),
        result.current.saved.mutateAsync({ job, saved: false }),
      ]);
    });
    await waitFor(() => expect(result.current.status.isError && result.current.saved.isError).toBe(true));
    expect(client.getQueryData(pageKey)).toEqual(infinite);
    expect(client.getQueryData(searchKey)).toEqual(page);
    expect(client.getQueryData(detailKey)).toEqual(job);
    client.clear();
  });
});
