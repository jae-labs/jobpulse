import React from 'react';
import { ChevronRight, MapPin, Banknote, Building2 } from 'lucide-react';
import type { Job } from '../../types/job';
import { StatusPill, MatchScoreBadge } from '../ui/StatusPill';
import { cn } from '../../lib/utils';

interface JobCardProps {
  job: Job;
  onSelect: (job: Job) => void;
  isSelected?: boolean;
}

export const JobCard = React.forwardRef<HTMLElement, JobCardProps>(
  ({ job, onSelect, isSelected = false }, ref) => {
    return (
      <article
        ref={ref}
        onClick={() => onSelect(job)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(job);
          }
        }}
        className={cn(
          'group relative flex cursor-pointer flex-col justify-between gap-2.5 rounded-xl border p-3.5 transition-all duration-150 outline-none select-none scroll-mt-24',
          isSelected
            ? 'border-zinc-500 bg-zinc-900 shadow-xs ring-1 ring-zinc-500/30'
            : 'border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50',
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Top Meta Line */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1 text-xs font-medium text-zinc-400 truncate max-w-[180px]">
                <Building2 className="size-3 text-zinc-500 shrink-0" />
                <span className="truncate">{job.company && job.company.trim() !== '.' ? job.company : 'Public Sector'}</span>
              </span>
              <span className="text-zinc-600">·</span>
              <StatusPill status={job.status} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <MatchScoreBadge score={job.relevance} />
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform',
                  isSelected ? 'text-zinc-200 translate-x-0.5' : 'text-zinc-600 group-hover:text-zinc-300 group-hover:translate-x-0.5',
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 font-mono">
            {job.location && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                <MapPin className="size-3 text-zinc-500 shrink-0" />
                <span className="truncate">{job.location}</span>
              </span>
            )}

            {job.salary_text && (
              <span className="inline-flex items-center gap-1 text-zinc-300">
                <Banknote className="size-3 text-zinc-500 shrink-0" />
                <span>{job.salary_text}</span>
              </span>
            )}

            {job.role_domain && (
              <span className="text-zinc-500 font-sans truncate max-w-[180px]">
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
                  className="rounded border border-zinc-800/80 bg-zinc-900/60 px-1.5 py-0.5 text-[11px] text-zinc-400 font-sans"
                >
                  {skill}
                </span>
              ))}
              {job.matched_skills.length > 3 && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  +{job.matched_skills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    );
  },
);

JobCard.displayName = 'JobCard';
