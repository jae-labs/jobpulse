import React from 'react';
import { ChevronRight, MapPin, Banknote, Building2 } from 'lucide-react';
import type { Job } from '../../types/job';
import { StatusPill, MatchScoreBadge } from '../ui/StatusPill';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

interface JobCardProps {
  job: Job;
  onSelect: (job: Job) => void;
  isSelected?: boolean;
  tabIndex?: number;
}

export const JobCard = React.forwardRef<HTMLButtonElement, JobCardProps>(
  ({ job, onSelect, isSelected = false, tabIndex = isSelected ? 0 : -1 }, ref) => {
    const { t } = useTranslation();
    return (
      <button
        ref={ref}
        type="button"
        data-job-card="true"
        tabIndex={tabIndex}
        onClick={() => onSelect(job)}
        aria-pressed={isSelected}
        className={cn(
          'group relative flex w-full cursor-pointer flex-col justify-between gap-2.5 rounded-xl border p-3.5 text-left transition-all duration-150 outline-none select-none scroll-mt-24',
          isSelected
            ? 'border-ds-accent bg-ds-selected shadow-xs ring-1 ring-ds-accent/30'
            : 'border-ds-border bg-ds-panel hover:border-ds-border-strong hover:bg-ds-hover focus-visible:border-ds-border-strong focus-visible:ring-1 focus-visible:ring-ds-border-strong',
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Top Meta Line */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1 text-xs font-medium text-ds-text-secondary truncate max-w-[180px]">
                <Building2 className="size-3 text-ds-text-muted shrink-0" />
                <span className="truncate">{job.company && job.company.trim() !== '.' ? job.company : t('common.publicSector')}</span>
              </span>
              <span className="text-ds-text-muted">·</span>
              <StatusPill status={job.status} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <MatchScoreBadge score={job.relevance} />
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform',
                  isSelected ? 'text-ds-text-secondary translate-x-0.5' : 'text-ds-text-muted group-hover:text-ds-text-secondary group-hover:translate-x-0.5',
                )}
              />
            </div>
          </div>

          {/* Role Title */}
          <span
            role="heading"
            aria-level={3}
            className={cn(
              'text-sm font-medium tracking-tight transition-colors line-clamp-2 leading-snug block',
              isSelected ? 'text-ds-text-primary' : 'text-ds-text-primary group-hover:text-ds-text-primary',
            )}
          >
            {job.title}
          </span>

          {/* Secondary Details: Location, Salary, Domain */}
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

            {job.role_domain && (
              <span className="text-ds-text-muted font-sans truncate max-w-[180px]">
                {job.role_domain}
              </span>
            )}
          </div>

          {/* Matched Skills Chips */}
          {job.matched_skills && job.matched_skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {job.matched_skills.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="rounded border border-ds-border-strong bg-ds-workspace px-1.5 py-0.5 text-[11px] text-ds-text-secondary font-sans font-medium"
                >
                  {skill}
                </span>
              ))}
              {job.matched_skills.length > 3 && (
                <span className="text-[10px] text-ds-text-muted font-mono">
                  +{job.matched_skills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    );
  },
);

JobCard.displayName = 'JobCard';
