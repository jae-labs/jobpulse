import { Trash2 } from 'lucide-react';
import { Button } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';
import { useUpdateJobStatusMutation } from '../../hooks/useQueries';
import type { Job } from '../../types/job';

export default function IgnoredJobButton({ job, userId }: { job: Job; userId?: string | null }) {
  const { t } = useTranslation();
  const mutation = useUpdateJobStatusMutation(userId);
  const ignored = job.status === 'not_interested';
  const label = t(ignored ? 'jobs.unignoreJob' : 'jobs.ignoreJob', { defaultValue: ignored ? 'Restore Job' : 'Archive Job' });
  return <div className="flex flex-col items-end">
    <Button variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={ignored}
      disabled={!userId || mutation.isPending} onClick={() => mutation.mutate({ job, status: ignored ? 'new' : 'not_interested' })}>
      <Trash2 aria-hidden="true" className={`size-4 ${ignored ? 'text-ds-negative' : 'text-ds-text-muted'}`} />
    </Button>
    {mutation.isError ? <span role="alert" className="text-xs text-ds-negative">{t('jobs.statusUpdateError')}</span> : null}
  </div>;
}
