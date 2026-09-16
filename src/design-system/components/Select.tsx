import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Layout classes for the wrapper, such as a constrained width in a field row. */
  containerClassName?: string;
  density?: 'default' | 'compact';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, density = 'default', ...props }, ref) => (
    <div className={cn('group relative w-full', containerClassName)}>
      <select
        ref={ref}
          className={cn(
            'h-9 w-full appearance-none rounded-[var(--ds-radius-control)] border border-ds-border-control bg-ds-control px-3 pr-10 text-ds-text-primary transition-colors hover:bg-ds-hover focus:border-ds-accent focus:outline-none ds-control-focus disabled:cursor-not-allowed disabled:opacity-50',
            density === 'compact' ? 'text-xs' : 'text-sm',
            className,
          )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ds-text-muted transition-colors group-hover:text-ds-text-secondary group-focus-within:text-ds-accent"
      />
    </div>
  ),
);
Select.displayName = 'Select';
