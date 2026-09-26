import React from 'react';
import { useTranslation } from 'react-i18next';
import type { JobStatus } from '../../types/job';
import { Pill } from '@jae-labs/ui';
import { cn } from '../../lib/utils';
import { statusPillTone } from '../../lib/statusTone';

interface StatusPillProps {
  status: JobStatus;
  className?: string;
  showDot?: boolean;
}

const STATUS_CONFIG: Record<
  JobStatus,
  { dotClass: string }
> = {
  new: {
    dotClass: 'bg-status-new',
  },
  applied: {
    dotClass: 'bg-status-applied',
  },
  interviewing: {
    dotClass: 'bg-status-interviewing',
  },
  interested: {
    dotClass: 'bg-status-interested',
  },
  not_interested: {
    dotClass: 'bg-status-muted',
  },
};

const StatusPillComponent: React.FC<StatusPillProps> = ({
  status,
  className,
  showDot = false,
}) => {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  const displayLabel = t(`status.${status}`);

  return (
    <Pill
      asChild
      tone={statusPillTone[status]}
      size="sm"
      className={cn('cursor-default select-text tracking-tight whitespace-nowrap transition-none', className)}
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

export const StatusPill = React.memo(StatusPillComponent);

const MatchScoreBadgeComponent: React.FC<{
  score: number;
  className?: string;
}> = ({ score, className }) => {
  const { t } = useTranslation();
  const tierColor =
    score >= 75
      ? 'border-ds-warning-border bg-ds-warning-subtle text-ds-warning'
      : score >= 50
        ? 'border-ds-warning-muted-border bg-ds-warning-muted-bg text-ds-warning'
        : 'border-ds-border-strong text-ds-text-secondary bg-ds-surface';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums',
        tierColor,
        className,
      )}
    >
      <span>{score}%</span>
      <span className="text-[9px] uppercase tracking-wider opacity-80 font-sans">{t('jobs.match', 'match')}</span>
    </span>
  );
};

export const MatchScoreBadge = React.memo(MatchScoreBadgeComponent);
