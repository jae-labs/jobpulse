import * as React from 'react';

import { cn } from '../utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'panel' | 'control';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'panel', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--ds-radius-card)] border border-ds-border',
        variant === 'panel' ? 'bg-ds-panel' : 'bg-ds-control',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';
