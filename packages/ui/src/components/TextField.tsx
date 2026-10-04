import * as React from 'react';

import { cn } from '../utils';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  density?: 'default' | 'compact';
  startAdornment?: React.ReactNode;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, density = 'default', startAdornment, ...props }, ref) => {
    const input = <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-ds-control border border-ds-border-control bg-ds-control px-3 text-ds-text-primary placeholder:text-ds-text-muted transition-colors hover:bg-ds-hover focus:border-ds-accent focus:outline-none ds-control-focus disabled:cursor-not-allowed disabled:opacity-50',
        density === 'compact' ? 'text-xs' : 'text-sm',
        startAdornment && 'pl-8',
        className,
      )}
      {...props}
    />;
    if (!startAdornment) return input;
    return <span className="relative block w-full">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs">
        {startAdornment}
      </span>
      {input}
    </span>;
  },
);
TextField.displayName = 'TextField';
