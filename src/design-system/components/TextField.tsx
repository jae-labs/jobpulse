import * as React from 'react';

import { cn } from '../utils';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  density?: 'default' | 'compact';
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, density = 'default', ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-[var(--ds-radius-control)] border border-ds-border-control bg-ds-control px-3 text-ds-text-primary placeholder:text-ds-text-muted transition-colors hover:bg-ds-hover focus:border-ds-accent focus:outline-none ds-control-focus disabled:cursor-not-allowed disabled:opacity-50',
        density === 'compact' ? 'text-xs' : 'text-sm',
        className,
      )}
      {...props}
    />
  ),
);
TextField.displayName = 'TextField';
