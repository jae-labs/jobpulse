import type { Job, JobAvailability } from '../types/job';

/** Fresh posting evidence expires to uncertainty; age never confirms closure. */
export function effectiveAvailability(job: Pick<Job, 'availability_status' | 'availability_checked_at'>, now = Date.now()): JobAvailability {
  if (job.availability_status === 'closed') return 'closed';
  const checked = Date.parse(job.availability_checked_at ?? '');
  return job.availability_status === 'active' && Number.isFinite(checked) && checked > now - 24 * 60 * 60 * 1000 && checked <= now ? 'active' : 'unverified';
}
