import type { ReactNode } from 'react';

import { cn } from '../utils';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-ds-text-primary">{title}</h1>
        {description && <p className="text-xs text-ds-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
