import type { HTMLAttributes, ReactNode } from 'react';

import { Card } from './Card';
import { cn } from '../utils';

export interface WidgetCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
}

/** Consistent dashboard surface, heading and content rhythm. */
export function WidgetCard({ title, children, className, ...props }: WidgetCardProps) {
  return <Card className={cn('flex h-full min-w-0 flex-col gap-4 p-6 lg:p-7', className)} {...props}>
    <header className="min-w-0 pr-9">
      <h3 className="text-xl font-bold text-ds-text-primary">{title}</h3>
    </header>
    {children}
  </Card>;
}
