import { Trash2, ArchiveRestore } from 'lucide-react';
import { Button, Tooltip } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';
import { useUpdateJobStatusMutation } from '../../hooks/useQueries';
import type { Job } from '../../types/job';

export default function IgnoredJobButton({ job, userId, className }: { job: Job; userId?: string | null; className?: string }) {
  const { t } = useTranslation();
  const mutation = useUpdateJobStatusMutation(userId);
  const ignored = job.status === 'not_interested';
  const label = t(ignored ? 'jobs.unignoreJob' : 'jobs.ignoreJob', { defaultValue: ignored ? 'Restore Job' : 'Archive Job' });
  return <div className="flex flex-col items-end">
    <Tooltip label={label} shortcut="d">
      <Button variant="ghost" size="icon" className={className} aria-label={label} aria-pressed={ignored}
        disabled={!userId || mutation.isPending} onClick={() => mutation.mutate({ job, status: ignored ? 'new' : 'not_interested' })}>
        {ignored ? (
          <ArchiveRestore aria-hidden="true" className="size-4 text-ds-text-primary" />
        ) : (
          <Trash2 aria-hidden="true" className="size-4 text-ds-text-muted hover:text-ds-negative transition-colors" />
        )}
      </Button>
    </Tooltip>
    {mutation.isError ? <span role="alert" className="text-xs text-ds-negative">{t('jobs.statusUpdateError')}</span> : null}
  </div>;
}
