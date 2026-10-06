import React from 'react';
import { Tooltip } from '@jae-labs/ui';
import { MapPin, Banknote, Building2 } from 'lucide-react';
import type { Job } from '../../types/job';
import { StatusPill, MatchScoreBadge } from '../ui/StatusPill';
import SavedJobButton from './SavedJobButton';
import IgnoredJobButton from './IgnoredJobButton';
import { cn } from '@jae-labs/ui';
import { useTranslation } from 'react-i18next';

interface JobCardProps {
  job: Job;
  userId?: string | null;
  onSelect: (job: Job) => void;
  isSelected?: boolean;
  tabIndex?: number;
}

const JobCardComponent = React.forwardRef<HTMLButtonElement, JobCardProps>(
  ({ job, userId, onSelect, isSelected = false, tabIndex = isSelected ? 0 : -1 }, ref) => {
    const { t } = useTranslation();
    return (
      <div className="relative">
      <Tooltip label={t('jobs.openDetails')} shortcut="Enter" className="w-full">
      <button
        ref={ref}
        type="button"
        data-job-card="true"
        data-job-id={job.id}
        tabIndex={tabIndex}
        onClick={() => onSelect(job)}
        aria-pressed={isSelected}
        aria-keyshortcuts="Enter Space"
        className={cn(
          'ds-control-focus group relative flex w-full cursor-pointer flex-col justify-between gap-2.5 rounded-ds-card border p-3.5 pr-20 text-left ds-motion-control outline-none select-none scroll-mt-24',
          isSelected
            ? 'border-ds-border-strong bg-ds-selected focus-visible:border-ds-accent'
            : 'border-ds-border bg-ds-panel hover:border-ds-border-strong hover:bg-ds-hover focus-visible:border-ds-accent',
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1 text-xs font-medium text-ds-text-secondary truncate max-w-[180px]">
                <Building2 className="size-3 text-ds-text-muted shrink-0" />
                <span className="truncate">{job.company && job.company.trim() !== '.' ? job.company : t('common.publicSector')}</span>
              </span>
              <span className="text-ds-text-muted">·</span>
              <StatusPill status={job.status} />
              <MatchScoreBadge score={job.relevance} isAssessed={job.fit_tier !== 'Unassessed'} />
            </div>
          </div>

          <span
            role="heading"
            aria-level={3}
            className={cn(
              'text-sm font-medium tracking-tight ds-motion-control line-clamp-2 leading-snug block',
              isSelected ? 'text-ds-text-primary' : 'text-ds-text-primary group-hover:text-ds-text-primary',
            )}
          >
            {job.title}
          </span>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ds-text-secondary font-mono">
            {job.location && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                <MapPin className="size-3 text-ds-text-muted shrink-0" />
                <span className="truncate">{job.location}</span>
              </span>
            )}

            {job.salary_text && (
              <span className="inline-flex items-center gap-1 text-ds-text-secondary">
                <Banknote className="size-3 text-ds-text-muted shrink-0" />
                <span>{job.salary_text}</span>
              </span>
            )}

            {job.sector && (
              <span className="text-ds-text-muted font-sans truncate max-w-[180px]">
                {job.sector}
              </span>
            )}
          </div>

          {job.matched_skills && job.matched_skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {job.matched_skills.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="rounded-ds-control border border-ds-border-strong bg-ds-surface px-1.5 py-0.5 text-xs text-ds-text-secondary font-sans font-medium"
                >
                  {skill}
                </span>
              ))}
              {job.matched_skills.length > 3 && (
                <span className="text-xs text-ds-text-muted font-mono">
                  +{job.matched_skills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
      </Tooltip>
      <div className="absolute right-2 top-2.5 flex items-center gap-1"><IgnoredJobButton job={job} userId={userId} className="size-8" /><SavedJobButton job={job} userId={userId} className="size-8" /></div>
      </div>
    );
  },
);

JobCardComponent.displayName = 'JobCard';

export const JobCard = React.memo(JobCardComponent);
