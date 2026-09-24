import React from 'react';
import { Card } from '../../design-system';

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  changePercent?: number;
  changeLabel?: string;
  badgeText?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subValue,
  changePercent,
  changeLabel,
  badgeText,
  icon: Icon,
  onClick,
}) => {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
        className={`flex flex-col justify-between space-y-2.5 p-3.5 sm:space-y-3 sm:p-5 ds-interactive-surface ds-focus-ring cursor-pointer active:scale-[0.99] transition-transform rounded-[var(--ds-radius-card)] bg-ds-panel border border-ds-border shadow-sm overflow-hidden text-left w-full h-full`}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="size-3.5 text-ds-text-secondary shrink-0" />}
              <span className="text-xs font-medium text-ds-text-secondary">
                {title}
              </span>
            </div>
            {badgeText && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-ds-control text-ds-text-secondary border border-ds-border-strong">
                {badgeText}
              </span>
            )}
          </div>
          <div className="pt-1 sm:pt-1.5">
            <span className="font-sans tabular-nums text-2xl sm:text-3xl font-bold tracking-tight text-ds-text-primary">
              {value}
            </span>
          </div>
          {subValue && (
            <div className="text-[11px] sm:text-xs text-ds-text-secondary font-normal pt-0.5 leading-snug">
              {subValue}
            </div>
          )}
        </div>

        {(changePercent !== undefined || changeLabel) && (
          <div className="pt-2.5 border-t border-ds-border flex items-center justify-between text-xs text-ds-text-secondary w-full">
            {changePercent !== undefined && (
              <span className={changePercent >= 0 ? 'text-ds-positive font-medium' : 'text-ds-negative font-medium'}>
                {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent)}%
              </span>
            )}
            {changeLabel && (
              <span className="text-ds-text-muted text-[11px]">{changeLabel}</span>
            )}
          </div>
        )}
      </button>
    );
  }

  return (
    <Card
      className={`flex flex-col justify-between space-y-2.5 p-3.5 sm:space-y-3 sm:p-5`}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-3.5 text-ds-text-secondary shrink-0" />}
            <span className="text-xs font-medium text-ds-text-secondary">
              {title}
            </span>
          </div>
          {badgeText && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-ds-control text-ds-text-secondary border border-ds-border-strong">
              {badgeText}
            </span>
          )}
        </div>
        <div className="pt-1 sm:pt-1.5">
          <span className="font-sans tabular-nums text-2xl sm:text-3xl font-bold tracking-tight text-ds-text-primary">
            {value}
          </span>
        </div>
        {subValue && (
          <div className="text-[11px] sm:text-xs text-ds-text-secondary font-normal pt-0.5 leading-snug">
            {subValue}
          </div>
        )}
      </div>

      {(changePercent !== undefined || changeLabel) && (
        <div className="pt-2.5 border-t border-ds-border flex items-center justify-between text-xs text-ds-text-secondary">
          {changePercent !== undefined && (
            <span className={changePercent >= 0 ? 'text-ds-positive font-medium' : 'text-ds-negative font-medium'}>
              {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent)}%
            </span>
          )}
          {changeLabel && (
            <span className="text-ds-text-muted text-[11px]">{changeLabel}</span>
          )}
        </div>
      )}
    </Card>
  );
};
