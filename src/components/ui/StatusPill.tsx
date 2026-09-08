import React from 'react';
import type { JobStatus } from '../../types/job';
import { cn } from '../../lib/utils';

interface StatusPillProps {
  status: JobStatus;
  className?: string;
  showDot?: boolean;
}

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; dotClass: string; containerClass: string }
> = {
  applied: {
    label: 'Applied',
    dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]',
    containerClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 dark:text-emerald-400',
  },
  interviewing: {
    label: 'Interview',
    dotClass: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.4)]',
    containerClass: 'border-purple-500/20 bg-purple-500/10 text-purple-300 dark:text-purple-400',
  },
  interested: {
    label: 'Interested',
    dotClass: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]',
    containerClass: 'border-sky-500/20 bg-sky-500/10 text-sky-300 dark:text-sky-400',
  },
  new: {
    label: 'New',
    dotClass: 'bg-zinc-400',
    containerClass: 'border-zinc-700/50 bg-zinc-800/60 text-zinc-300',
  },
  not_interested: {
    label: 'Not Interested',
    dotClass: 'bg-zinc-600',
    containerClass: 'border-zinc-800 bg-zinc-900/60 text-zinc-500',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  className,
  showDot = true,
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap transition-colors',
        config.containerClass,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn('size-1.5 rounded-full shrink-0', config.dotClass)}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
};

export const MatchScoreBadge: React.FC<{
  score: number;
  className?: string;
}> = ({ score, className }) => {
  const tierColor =
    score >= 75
      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
      : score >= 50
        ? 'border-zinc-700 text-zinc-300 bg-zinc-900/50'
        : 'border-zinc-800 text-zinc-500 bg-zinc-950/40';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums',
        tierColor,
        className,
      )}
    >
      <span>{score}%</span>
      <span className="text-[9px] uppercase tracking-wider opacity-60 font-sans">fit</span>
    </span>
  );
};
