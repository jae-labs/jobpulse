import React from 'react';
import { useTranslation } from 'react-i18next';
import type { JobStatus } from '../../types/job';
import { Pill, type PillVariant } from '../../design-system';
import { cn } from '../../lib/utils';

interface StatusPillProps {
  status: JobStatus;
  className?: string;
  showDot?: boolean;
}

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; dotClass: string; variant: PillVariant }
> = {
  new: {
    label: 'New',
    dotClass: 'bg-ds-status-new',
    variant: 'status-new',
  },
  applied: {
    label: 'Applied',
    dotClass: 'bg-ds-status-applied',
    variant: 'status-applied',
  },
  interviewing: {
    label: 'Interview',
    dotClass: 'bg-ds-status-interviewing',
    variant: 'status-interviewing',
  },
  interested: {
    label: 'Interested',
    dotClass: 'bg-ds-status-interested',
    variant: 'status-interested',
  },
  not_interested: {
    label: 'Not Interested',
    dotClass: 'bg-ds-status-muted',
    variant: 'status-muted',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  className,
  showDot = false,
}) => {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  const displayLabel = t(`status.${status}` as any) || config.label;

  return (
    <Pill
      asChild
      variant={config.variant}
      size="sm"
      className={cn('cursor-default select-text tracking-tight whitespace-nowrap', className)}
    >
      <span>
        {showDot && (
          <span
            className={cn('size-1.5 rounded-full shrink-0', config.dotClass)}
            aria-hidden="true"
          />
        )}
        <span>{displayLabel}</span>
      </span>
    </Pill>
  );
};

export const MatchScoreBadge: React.FC<{
  score: number;
  className?: string;
}> = ({ score, className }) => {
  const { t } = useTranslation();
  const tierColor =
    score >= 75
      ? 'border-ds-warning-border bg-ds-warning-subtle text-ds-warning'
      : score >= 50
        ? 'border-ds-warning-muted-border bg-ds-warning-muted-bg text-ds-warning'
        : 'border-ds-border-strong text-ds-text-secondary bg-ds-workspace';

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
