import React from 'react';

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
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-3.5 sm:p-5 surface-card-hover flex flex-col justify-between space-y-2.5 sm:space-y-3 ${
        onClick ? 'cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/60 active:scale-[0.99] transition-transform' : ''
      }`}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-3.5 text-zinc-400 shrink-0" />}
            <span className="text-xs font-medium text-zinc-400">
              {title}
            </span>
          </div>
          {badgeText && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800">
              {badgeText}
            </span>
          )}
        </div>
        <div className="pt-1 sm:pt-1.5">
          <span className="font-sans tabular-nums text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            {value}
          </span>
        </div>
        {subValue && (
          <div className="text-[11px] sm:text-xs text-zinc-400 font-normal pt-0.5 leading-snug">
            {subValue}
          </div>
        )}
      </div>

      {(changePercent !== undefined || changeLabel) && (
        <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          {changePercent !== undefined && (
            <span className={changePercent >= 0 ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
              {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent)}%
            </span>
          )}
          {changeLabel && <span className="text-zinc-500 ml-auto text-[11px]">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
};
