import { Star } from 'lucide-react';
import { Button } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';
import { useUpdateJobSavedMutation } from '../../hooks/useQueries';
import type { Job } from '../../types/job';

export default function SavedJobButton({ job, userId }: { job: Job; userId?: string | null }) {
  const { t } = useTranslation();
  const mutation = useUpdateJobSavedMutation(userId);
  const saved = job.is_saved === true;
  const label = t(saved ? 'jobs.unsaveJob' : 'jobs.saveJob');
  return <div className="flex flex-col items-end">
    <Button variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={saved}
      disabled={!userId || mutation.isPending} onClick={() => mutation.mutate({ job, saved: !saved })}>
      <Star aria-hidden="true" className={`size-4 ${saved ? 'fill-current text-status-saved' : 'text-ds-text-muted'}`} />
    </Button>
    {mutation.isError ? <span role="alert" className="text-xs text-ds-negative">{t('jobs.saveJobError')}</span> : null}
  </div>;
}
