import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: /click me/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass('bg-ds-action-primary');
  });

  it('renders with secondary and ghost variants', () => {
    const { rerender } = render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-ds-border');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('hover:bg-ds-hover');
  });

  it('handles click events and disabled state', () => {
    const handleClick = vi.fn();
    const { rerender } = render(<Button onClick={handleClick}>Action</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);

    rerender(<Button onClick={handleClick} disabled>Disabled</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

it('does not submit a form unless explicitly configured to submit', () => {
  const submit = vi.fn((event) => event.preventDefault());
  const { rerender } = render(<form onSubmit={submit}><Button>Action</Button></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Action' }));
  expect(submit).not.toHaveBeenCalled();
  rerender(<form onSubmit={submit}><Button type="submit">Save</Button></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(submit).toHaveBeenCalledOnce();
});
