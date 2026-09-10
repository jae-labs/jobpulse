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
}

export const JobCard = React.forwardRef<HTMLButtonElement, JobCardProps>(
  ({ job, onSelect, isSelected = false }, ref) => {
    const { t } = useTranslation();
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onSelect(job)}
        aria-pressed={isSelected}
        className={cn(
          'group relative flex w-full cursor-pointer flex-col justify-between gap-2.5 rounded-xl border p-3.5 text-left transition-all duration-150 outline-none select-none scroll-mt-24',
          isSelected
            ? 'border-indigo-500/80 bg-[#1c1d25] shadow-xs ring-1 ring-indigo-500/30'
            : 'border-white/[0.08] bg-[#16171b] hover:border-white/[0.16] hover:bg-[#1a1b22] focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500/30',
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Top Meta Line */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1 text-xs font-medium text-zinc-300 truncate max-w-[180px]">
                <Building2 className="size-3 text-zinc-400 shrink-0" />
                <span className="truncate">{job.company && job.company.trim() !== '.' ? job.company : t('common.publicSector')}</span>
              </span>
              <span className="text-zinc-500">·</span>
              <StatusPill status={job.status} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <MatchScoreBadge score={job.relevance} />
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform',
                  isSelected ? 'text-zinc-200 translate-x-0.5' : 'text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-0.5',
                )}
              />
            </div>
          </div>

          {/* Role Title */}
          <h3
            className={cn(
              'text-sm font-medium tracking-tight transition-colors line-clamp-2 leading-snug',
              isSelected ? 'text-white' : 'text-zinc-100 group-hover:text-white',
            )}
          >
            {job.title}
          </h3>

          {/* Secondary Details: Location, Salary, Domain */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-300 font-mono">
            {job.location && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                <MapPin className="size-3 text-zinc-400 shrink-0" />
                <span className="truncate">{job.location}</span>
              </span>
            )}

            {job.salary_text && (
              <span className="inline-flex items-center gap-1 text-zinc-200">
                <Banknote className="size-3 text-zinc-400 shrink-0" />
                <span>{job.salary_text}</span>
              </span>
            )}

            {job.role_domain && (
              <span className="text-zinc-400 font-sans truncate max-w-[180px]">
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
                  className="rounded border border-white/[0.14] bg-[#111215] px-1.5 py-0.5 text-[11px] text-zinc-300 font-sans font-medium"
                >
                  {skill}
                </span>
              ))}
              {job.matched_skills.length > 3 && (
                <span className="text-[10px] text-zinc-400 font-mono">
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
