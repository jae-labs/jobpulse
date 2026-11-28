import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useJobByIdQuery, useJobsInfiniteQuery, useUpdateJobSavedMutation, useUpdateJobStatusMutation } from './useJobQueries';
import { queryKeys } from '../lib/queryKeys';
import type { Job } from '../types/job';

const server = vi.hoisted(() => ({ owner: 'owner-a', saved: vi.fn(), status: vi.fn() }));
vi.mock('../lib/userSession', () => ({ getCurrentUserId: async () => server.owner }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ upsert: server.status }) },
  getAccountClient: async () => ({ rpc: server.saved }),
}));
const first: Job = { id: 1, title: 'Synthetic role', company: 'Synthetic employer', location: 'Dublin',
  employment_type: 'Full time', status: 'new', is_saved: false, relevance: 0, salary_text: null,
  matched_skills: [], url: 'https://example.invalid/1', source: 'test', last_seen_at: '2026-10-04' };
const second: Job = { ...first, id: 2 };
const params = { status: 'new' };
function deferred() {
  let resolve!: (result: { error: { message: string } | null }) => void;
  const promise = new Promise<{ error: { message: string } | null }>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const owner of ['owner-a', 'owner-b']) {
    client.setQueryData(queryKeys.jobsPage(owner, params), { pages: [{ total: 2, items: [first, second] }], pageParams: [0] });
    client.setQueryData(queryKeys.jobById(1, owner), first);
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ owner }) => ({
    list: useJobsInfiniteQuery(owner, params, false), detail: useJobByIdQuery(1, owner, false),
    saved: useUpdateJobSavedMutation(owner), status: useUpdateJobStatusMutation(owner),
  }), { wrapper, initialProps: { owner: 'owner-a' } });
  return { client, ...hook };
}
beforeEach(() => { vi.clearAllMocks(); server.owner = 'owner-a'; });

it('updates both stars while the write is pending and restores both on failure', async () => {
  const write = deferred(); server.saved.mockReturnValue(write.promise);
  const { result, client } = setup();
  act(() => result.current.saved.mutate({ job: first, saved: true }));
  await waitFor(() => expect(result.current.list.data?.pages[0].items[0].is_saved).toBe(true));
  expect(result.current.detail.data?.is_saved).toBe(true);
  expect(result.current.saved.isPending).toBe(true);
  expect(client.getQueryData<Job>(queryKeys.jobById(1, 'owner-b'))?.is_saved).toBe(false);
  await act(async () => write.resolve({ error: { message: 'Synthetic failure' } }));
  await waitFor(() => expect(result.current.saved.isError).toBe(true));
  expect(result.current.detail.data?.is_saved).toBe(false);
  expect(result.current.list.data?.pages[0].items[0].is_saved).toBe(false);
});

it('removes an archived row immediately and commits the filtered total on success', async () => {
  const write = deferred(); server.status.mockReturnValue(write.promise);
  const { result } = setup();
  act(() => result.current.status.mutate({ job: first, status: 'not_interested' }));
  await waitFor(() => expect(result.current.list.data?.pages[0].items.map((job) => job.id)).toEqual([2]));
  expect(result.current.list.data?.pages[0].total).toBe(1);
  expect(result.current.detail.data?.status).toBe('not_interested');
  expect(result.current.status.isPending).toBe(true);
  await act(async () => write.resolve({ error: null }));
  await waitFor(() => expect(result.current.status.isSuccess).toBe(true));
  expect(result.current.list.data?.pages[0].items.map((job) => job.id)).toEqual([2]);
  expect(result.current.list.data?.pages[0].total).toBe(1);
});

it('restores failed archive removal without undoing a concurrent bookmark', async () => {
  const saved = deferred(); const status = deferred();
  server.saved.mockReturnValue(saved.promise); server.status.mockReturnValue(status.promise);
  const { result } = setup();
  act(() => {
    result.current.saved.mutate({ job: first, saved: true });
    result.current.status.mutate({ job: first, status: 'not_interested' });
  });
  await waitFor(() => expect(result.current.list.data?.pages[0].items.map((job) => job.id)).toEqual([2]));
  await act(async () => status.resolve({ error: { message: 'Synthetic failure' } }));
  await waitFor(() => expect(result.current.status.isError).toBe(true));
  expect(result.current.list.data?.pages[0].items[0]).toMatchObject({ id: 1, status: 'new', is_saved: true });
  expect(result.current.detail.data).toMatchObject({ status: 'new', is_saved: true });
  await act(async () => saved.resolve({ error: null }));
  await waitFor(() => expect(result.current.saved.isSuccess).toBe(true));
  expect(result.current.list.data?.pages[0].items[0].is_saved).toBe(true);
});

it('does not project or recreate old-account changes after an identity switch', async () => {
  const write = deferred(); server.saved.mockReturnValue(write.promise);
  const { result, rerender, client } = setup();
  act(() => result.current.saved.mutate({ job: first, saved: true }));
  await waitFor(() => expect(server.saved).toHaveBeenCalled());
  server.owner = 'owner-b';
  client.removeQueries({ queryKey: queryKeys.jobById(1, 'owner-a') });
  client.removeQueries({ queryKey: queryKeys.jobsPage('owner-a') });
  rerender({ owner: 'owner-b' });
  expect(result.current.detail.data?.is_saved).toBe(false);
  expect(result.current.list.data?.pages[0].items[0].is_saved).toBe(false);
  await act(async () => write.resolve({ error: null }));
  await waitFor(() => expect(client.getMutationCache().getAll()[0].state.status).toBe('error'));
  expect(client.getQueryData(queryKeys.jobById(1, 'owner-a'))).toBeUndefined();
  expect(result.current.detail.data?.is_saved).toBe(false);
});

it('keeps the latest queued star intent when an earlier write fails', async () => {
  const one = deferred(); const two = deferred();
  server.saved.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
  const { result } = setup();
  act(() => result.current.saved.mutate({ job: first, saved: true }));
  await waitFor(() => expect(result.current.detail.data?.is_saved).toBe(true));
  act(() => result.current.saved.mutate({ job: { ...first, is_saved: true }, saved: false }));
  await waitFor(() => expect(result.current.detail.data?.is_saved).toBe(false));
  await act(async () => one.resolve({ error: { message: 'Synthetic failure' } }));
  await waitFor(() => expect(server.saved).toHaveBeenCalledTimes(2));
  expect(result.current.list.data?.pages[0].items[0].is_saved).toBe(false);
  await act(async () => two.resolve({ error: null }));
  await waitFor(() => expect(result.current.saved.isSuccess).toBe(true));
  expect(result.current.detail.data?.is_saved).toBe(false);
});
