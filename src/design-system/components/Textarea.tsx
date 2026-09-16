import * as React from 'react';

import { cn } from '../utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  density?: 'default' | 'compact';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, density = 'default', ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-y rounded-[var(--ds-radius-control)] border border-ds-border-control bg-ds-control p-3 leading-relaxed text-ds-text-primary placeholder:text-ds-text-muted transition-colors hover:bg-ds-hover focus:border-ds-accent focus:outline-none ds-control-focus disabled:cursor-not-allowed disabled:opacity-50',
        density === 'compact' ? 'text-xs' : 'text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
