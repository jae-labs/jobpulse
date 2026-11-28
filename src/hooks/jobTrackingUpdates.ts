import { useMutationState, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import type { Job, JobStatus, JobsPageParams, JobsPageResult } from '../types/job';

export type JobTrackingUpdate = { job: Job; status: JobStatus } | { job: Job; saved: boolean };

/** Pending writes are shared by the list, inspector and search, and vanish on failure. */
export function useJobTrackingUpdates(userId?: string | null) {
  return useMutationState({
    filters: { mutationKey: queryKeys.jobTrackingMutations(userId), status: 'pending', exact: true },
    select: (mutation) => mutation.state.variables as JobTrackingUpdate,
  });
}

type TrackingPatch = Partial<Pick<Job, 'status' | 'is_saved'>>;
function trackingPatches(updates: JobTrackingUpdate[]) {
  const patches = new Map<number, TrackingPatch>();
  for (const update of updates) {
    patches.set(update.job.id, { ...patches.get(update.job.id),
      ...('saved' in update ? { is_saved: update.saved } : { status: update.status }) });
  }
  return patches;
}

export function projectJob(job: Job, updates: JobTrackingUpdate[]): Job {
  const patch = trackingPatches(updates).get(job.id);
  return patch ? { ...job, ...patch } : job;
}

function matchesStatus(job: Job, status?: string) {
  if (!status || status === 'all') return true;
  if (status === 'saved' || status === 'interested') return job.is_saved === true;
  return job.status === status;
}

function projectPage(page: JobsPageResult, params: JobsPageParams, patches: Map<number, TrackingPatch>): JobsPageResult {
  let removed = 0;
  const items: Job[] = [];
  for (const job of page.items) {
    const patch = patches.get(job.id);
    const updated = patch ? { ...job, ...patch } : job;
    if (matchesStatus(updated, params.status)) items.push(updated);
    else removed++;
  }
  return { ...page, items, total: Math.max(0, page.total - removed) };
}

export function projectJobPage(page: JobsPageResult, params: JobsPageParams, updates: JobTrackingUpdate[]): JobsPageResult {
  return updates.length ? projectPage(page, params, trackingPatches(updates)) : page;
}

export function projectJobPages(data: InfiniteData<JobsPageResult>, params: JobsPageParams, updates: JobTrackingUpdate[]) {
  if (!updates.length) return data;
  const patches = trackingPatches(updates);
  let removed = 0;
  const pages = data.pages.map((page) => {
    const updated = projectPage(page, params, patches);
    removed += page.items.length - updated.items.length;
    return updated;
  });
  return { ...data, pages: pages.map((page, index) => ({ ...page, total: Math.max(0, data.pages[index].total - removed) })) };
}

/** Commit only the confirmed tracking field; never replace unrelated data or another account's caches. */
export function commitJobTrackingUpdate(client: QueryClient, userId: string, update: JobTrackingUpdate) {
  const detailKey = queryKeys.jobById(update.job.id, userId);
  if (client.getQueryState(detailKey)?.status === 'success') {
    client.setQueryData<Job | null>(detailKey, (job) => job ? projectJob(job, [update]) : job);
  }
  for (const [key, data] of client.getQueriesData<InfiniteData<JobsPageResult>>({ queryKey: queryKeys.jobsPage(userId) })) {
    if (data && client.getQueryState(key)?.status === 'success') client.setQueryData(key, projectJobPages(data, (key[2] ?? {}) as JobsPageParams, [update]));
  }
  for (const [key, data] of client.getQueriesData<JobsPageResult>({ queryKey: queryKeys.jobsSearchPage(userId) })) {
    if (data && client.getQueryState(key)?.status === 'success') client.setQueryData(key, projectJobPage(data, (key[2] ?? {}) as JobsPageParams, [update]));
  }
}
