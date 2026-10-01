import type { PillTone } from '@jae-labs/ui';
import type { JobStatus } from '../types/job';

export const statusPillTone = {
  new: 'data-1',
  applied: 'data-2',
  interviewing: 'data-3',
  interested: 'data-4',
  not_interested: 'muted',
} as const satisfies Record<JobStatus, PillTone>;
