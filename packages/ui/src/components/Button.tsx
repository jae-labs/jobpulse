import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ds-control text-sm font-medium ds-motion-control ds-focus-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-ds-action-primary text-ds-action-primary-text hover:bg-ds-action-primary/90',
        secondary: 'border border-ds-border bg-ds-control text-ds-text-secondary hover:border-ds-border-strong hover:bg-ds-hover hover:text-ds-text-primary',
        ghost: 'text-ds-text-secondary hover:bg-ds-hover hover:text-ds-text-primary',
        danger: 'border border-ds-negative bg-ds-negative/10 text-ds-negative hover:bg-ds-negative/20',
        quiet: 'border border-ds-border-strong bg-ds-control text-ds-accent hover:border-ds-border-strong hover:bg-ds-hover hover:text-ds-text-primary',
        dangerQuiet: 'border border-ds-border-strong bg-ds-control text-ds-text-secondary hover:border-ds-negative hover:bg-ds-negative/10 hover:text-ds-negative',
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: 'h-7 px-2.5 text-xs',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button };
