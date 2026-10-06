import * as React from 'react';

import { cn } from '../utils';

export interface RangeProps extends React.InputHTMLAttributes<HTMLInputElement> {
  density?: 'default' | 'compact';
}

export const Range = React.forwardRef<HTMLInputElement, RangeProps>(
  ({ className, density = 'default', min = 0, max = 100, value, defaultValue, onChange, style, ...props }, ref) => {
    const lower = Number(min);
    const upper = Number(max);
    const [localValue, setLocalValue] = React.useState(defaultValue ?? (lower + upper) / 2);
    const current = Number(value ?? localValue);
    const progress = upper > lower ? Math.min(100, Math.max(0, ((current - lower) / (upper - lower)) * 100)) : 0;

    return (
      <input
        {...props}
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          setLocalValue(event.currentTarget.value);
          onChange?.(event);
        }}
        style={{ '--ds-range-progress': `${progress}%`, ...style } as React.CSSProperties}
        className={cn('ds-range w-full min-w-0 ds-focus-ring', density === 'compact' && 'ds-range-compact', className)}
      />
    );
  },
);
Range.displayName = 'Range';
