import type { ComponentType, ReactNode } from 'react';

import { cn } from '../utils';
import { Card } from './Card';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

export function EmptyState({ title, description, action, icon: Icon, className }: EmptyStateProps) {
  return (
    <Card className={cn('flex flex-col items-center p-8 text-center', className)}>
      {Icon && <Icon className="mb-3 size-5 text-ds-text-muted" aria-hidden="true" />}
      <h2 className="text-sm font-semibold text-ds-text-primary">{title}</h2>
      {description && <p className="mt-1 max-w-md text-xs text-ds-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
