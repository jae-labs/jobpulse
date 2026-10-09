import type { Database } from '../types/database.types';
import type { JobsPageParams } from '../types/job';

export function jobsRpcArgs(params: JobsPageParams, limit = params.limit ?? 40, offset = params.offset ?? 0): Database['public']['Functions']['get_jobs_availability_page']['Args'] {
  return {
    p_availability: availabilityScope(params),
    p_status: params.status || 'all', p_sector: params.sector || 'all', p_min_match: params.minMatch ?? 0,
    p_location: params.location || 'all', p_salary: params.salary || 'all', p_search: params.search || undefined,
    p_sort_by: params.sortBy || 'match', p_sort_dir: params.sortDir || 'desc',
    p_limit: Math.min(Math.max(limit, 1), 100), p_offset: Math.max(offset, 0),
  };
}

export function availabilityScope(params: JobsPageParams): 'active' | 'closed' | 'unverified' | 'all' {
  return params.availability ?? (params.status && !['new', 'all'].includes(params.status) ? 'all' : 'active');
}
