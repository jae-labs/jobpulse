import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './Field';
import { TextField } from './TextField';

describe('Field', () => {
  it('connects the label, instructions and error to the required control', () => {
    render(<Field label="Email" description="Use a reachable address." error="Enter an address." required>
      {(props) => <TextField {...props} />}
    </Field>);
    const control = screen.getByRole('textbox', { name: 'Email' });
    expect(control).toBeRequired();
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription('Use a reachable address. Enter an address.');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an address.');
  });
  it('keeps sibling field identities separate and removes resolved errors', () => {
    const form = (error?: string) => <><Field label="First" error={error}>{(props) => <TextField {...props} />}</Field><Field label="Second">{(props) => <TextField {...props} />}</Field></>;
    const { rerender } = render(form('Review this value.'));
    const first = screen.getByRole('textbox', { name: 'First' });
    expect(first.id).not.toBe(screen.getByRole('textbox', { name: 'Second' }).id);
    rerender(form());
    expect(first).not.toHaveAttribute('aria-invalid');
    expect(first).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
