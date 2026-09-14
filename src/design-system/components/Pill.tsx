import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../utils';

export type PillVariant =
  | 'neutral'
  | 'status-new'
  | 'status-applied'
  | 'status-interviewing'
  | 'status-interested'
  | 'status-muted';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: React.ReactNode;
  count?: React.ReactNode;
  active?: boolean;
  variant?: PillVariant;
  color?: string;
  size?: 'sm' | 'default';
  layout?: 'inline' | 'spread';
  asChild?: boolean;
}

const variantStyles: Record<PillVariant, { idle: string; active: string }> = {
  neutral: {
    idle: 'border-ds-border-strong bg-ds-workspace text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-hover',
    active: 'border-ds-border-strong bg-ds-hover text-ds-text-primary shadow-xs ring-1 ring-white/10 font-semibold',
  },
  'status-new': {
    idle: 'border-ds-status-new/30 bg-ds-status-new/10 text-ds-status-new hover:bg-ds-status-new/15 hover:border-ds-status-new/50',
    active: 'border-ds-status-new/60 bg-ds-status-new/25 text-ds-status-new shadow-xs ring-1 ring-ds-status-new/30 font-semibold',
  },
  'status-applied': {
    idle: 'border-ds-status-applied/30 bg-ds-status-applied/10 text-ds-status-applied hover:bg-ds-status-applied/15 hover:border-ds-status-applied/50',
    active: 'border-ds-status-applied/60 bg-ds-status-applied/25 text-ds-status-applied shadow-xs ring-1 ring-ds-status-applied/30 font-semibold',
  },
  'status-interviewing': {
    idle: 'border-ds-status-interviewing/30 bg-ds-status-interviewing/10 text-ds-status-interviewing hover:bg-ds-status-interviewing/15 hover:border-ds-status-interviewing/50',
    active: 'border-ds-status-interviewing/60 bg-ds-status-interviewing/25 text-ds-status-interviewing shadow-xs ring-1 ring-ds-status-interviewing/30 font-semibold',
  },
  'status-interested': {
    idle: 'border-ds-status-interested/30 bg-ds-status-interested/10 text-ds-status-interested hover:bg-ds-status-interested/15 hover:border-ds-status-interested/50',
    active: 'border-ds-status-interested/60 bg-ds-status-interested/25 text-ds-status-interested shadow-xs ring-1 ring-ds-status-interested/30 font-semibold',
  },
  'status-muted': {
    idle: 'border-ds-status-muted/30 bg-ds-status-muted/10 text-ds-status-muted hover:bg-ds-status-muted/15 hover:border-ds-status-muted/50',
    active: 'border-ds-status-muted/60 bg-ds-status-muted/25 text-ds-status-muted shadow-xs ring-1 ring-ds-status-muted/30 font-semibold',
  },
};

export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  (
    {
      label,
      count,
      active = false,
      variant = 'neutral',
      color,
      size = 'default',
      layout = 'inline',
      asChild = false,
      className,
      children,
      style,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const hasCustomColor = Boolean(color);

    const colorClasses = hasCustomColor
      ? cn(
          'border-[color-mix(in_srgb,var(--pill-color)_30%,transparent)] bg-[color-mix(in_srgb,var(--pill-color)_10%,transparent)] text-[var(--pill-color)] hover:bg-[color-mix(in_srgb,var(--pill-color)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--pill-color)_50%,transparent)]',
          active &&
            'border-[color-mix(in_srgb,var(--pill-color)_60%,transparent)] bg-[color-mix(in_srgb,var(--pill-color)_25%,transparent)] shadow-xs ring-1 ring-[color-mix(in_srgb,var(--pill-color)_30%,transparent)] font-semibold',
        )
      : active
        ? variantStyles[variant].active
        : variantStyles[variant].idle;

    const sizeClasses =
      size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs';

    const layoutClasses =
      layout === 'spread'
        ? 'flex w-full items-center justify-between gap-1.5'
        : 'inline-flex items-center gap-1.5';

    const mergedStyle = hasCustomColor
      ? ({ ...style, '--pill-color': color } as React.CSSProperties)
      : style;

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        aria-pressed={asChild ? undefined : (props['aria-pressed'] ?? active)}
        style={mergedStyle}
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
