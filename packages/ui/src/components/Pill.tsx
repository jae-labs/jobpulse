import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../utils';

const dataTones = [
  'data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6', 'data-7', 'data-8',
  'data-9', 'data-10', 'data-11', 'data-12', 'data-13', 'data-14', 'data-15', 'data-16',
] as const;

const chartTones = [
  'chart-1', 'chart-2', 'chart-3', 'chart-4',
  'chart-5', 'chart-6', 'chart-7', 'chart-8',
] as const;

export type PillTone =
  | 'neutral'
  | 'muted'
  | 'info'
  | 'positive'
  | 'warning'
  | 'negative'
  | (typeof dataTones)[number]
  | (typeof chartTones)[number];

export interface PillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'style'> {
  label?: React.ReactNode;
  count?: React.ReactNode;
  active?: boolean;
  tone?: PillTone;
  size?: 'sm' | 'default';
  layout?: 'inline' | 'spread';
  asChild?: boolean;
}

function toneColor(tone: Exclude<PillTone, 'neutral'>): string {
  switch (tone) {
    case 'muted': return 'var(--ds-color-text-muted)';
    case 'info': return 'var(--ds-color-info)';
    case 'positive': return 'var(--ds-color-positive)';
    case 'warning': return 'var(--ds-color-warning)';
    case 'negative': return 'var(--ds-color-negative)';
    default: return `var(--ds-color-${tone})`;
  }
}

export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  (
    {
      label,
      count,
      active = false,
      tone = 'neutral',
      size = 'default',
      layout = 'inline',
      asChild = false,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const hasToneColor = tone !== 'neutral';
    const colorClasses = hasToneColor
      ? cn(
          'border-[color-mix(in_srgb,var(--pill-color)_30%,transparent)] bg-[color-mix(in_srgb,var(--pill-color)_10%,transparent)] text-[var(--pill-color)] hover:bg-[color-mix(in_srgb,var(--pill-color)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--pill-color)_50%,transparent)]',
          active &&
            'border-[color-mix(in_srgb,var(--pill-color)_60%,transparent)] bg-[color-mix(in_srgb,var(--pill-color)_25%,transparent)] shadow-xs ring-1 ring-[color-mix(in_srgb,var(--pill-color)_30%,transparent)] font-semibold',
        )
      : active
        ? 'border-ds-border-strong bg-ds-hover text-ds-text-primary shadow-xs ring-1 ring-ds-border-strong font-semibold hover:border-ds-border-control hover:bg-ds-selected'
        : 'border-ds-border-strong bg-ds-surface text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-hover';

    const sizeClasses =
      size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs';

    const layoutClasses =
      layout === 'spread'
        ? 'flex w-full items-center justify-between gap-1.5'
        : 'inline-flex items-center gap-1.5';

    const toneStyle = hasToneColor
      ? ({ '--pill-color': toneColor(tone) } as React.CSSProperties)
      : undefined;

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        aria-pressed={asChild ? undefined : (props['aria-pressed'] ?? active)}
        style={toneStyle}
        className={cn(
          'ds-focus-ring rounded-full border font-medium transition-colors duration-150 cursor-pointer select-none text-left',
          sizeClasses,
          layoutClasses,
          colorClasses,
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            {label !== undefined && (
              <span className="truncate font-medium">{label}</span>
            )}
            {count !== undefined && (
              <span className="font-mono text-[10px] opacity-80 shrink-0 font-semibold">
                {count}
              </span>
            )}
          </>
        )}
      </Comp>
    );
  },
);

Pill.displayName = 'Pill';
