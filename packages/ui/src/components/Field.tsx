import { useId, type ReactNode } from 'react';
import { cn } from '../utils';

export interface FieldControlProps {
  id: string;
  required?: boolean;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export interface FieldProps {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}

/** Connects a native control to its visible label, description and validation error. */
export function Field({ id, label, description, error, required, className, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined;
  return <div className={cn('ds-field', className)}>
    <label htmlFor={controlId} className="text-sm font-medium text-ds-text-secondary">
      {label}{required && <span aria-hidden="true"> *</span>}
    </label>
    {children({ id: controlId, required, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
    {description && <p id={descriptionId} className="text-xs text-ds-text-muted">{description}</p>}
    {error && <p id={errorId} role="alert" className="text-xs text-ds-negative">{error}</p>}
  </div>;
}
