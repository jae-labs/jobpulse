import * as React from 'react';

import { cn } from '../utils';

export type RangeProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Range = React.forwardRef<HTMLInputElement, RangeProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn(
        'h-2 w-full cursor-pointer appearance-auto rounded-ds-control bg-ds-hover accent-ds-accent ds-focus-ring',
        className,
      )}
      {...props}
    />
  ),
);
Range.displayName = 'Range';
