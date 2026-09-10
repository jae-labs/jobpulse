import React from 'react';
import { useTranslation } from 'react-i18next';
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
  new: {
    label: 'New',
    dotClass: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]',
    containerClass: 'border-sky-500/20 bg-sky-500/10 text-sky-300 dark:text-sky-400',
  },
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
    dotClass: 'bg-pink-400 shadow-[0_0_8px_rgba(236,72,153,0.4)]',
    containerClass: 'border-pink-500/20 bg-pink-500/10 text-pink-300 dark:text-pink-400',
  },
  not_interested: {
    label: 'Not Interested',
    dotClass: 'bg-zinc-400',
    containerClass: 'border-zinc-700/80 bg-zinc-800/80 text-zinc-200',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  className,
  showDot = true,
}) => {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  const displayLabel = t(`status.${status}` as any) || config.label;

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
      <span>{displayLabel}</span>
    </span>
  );
};

export const MatchScoreBadge: React.FC<{
  score: number;
  className?: string;
}> = ({ score, className }) => {
  const { t } = useTranslation();
  const tierColor =
    score >= 75
      ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10 shadow-[0_0_10px_rgba(250,204,21,0.1)]'
      : score >= 50
        ? 'border-amber-500/25 text-amber-300/90 bg-amber-500/5'
        : 'border-white/[0.14] text-zinc-300 bg-[#111215]';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums',
        tierColor,
        className,
      )}
    >
      <span>{score}%</span>
      <span className="text-[9px] uppercase tracking-wider opacity-80 font-sans">{t('jobs.fit', 'fit')}</span>
    </span>
  );
};
