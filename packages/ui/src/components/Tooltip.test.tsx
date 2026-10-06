import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';

afterEach(() => vi.useRealTimers());
describe('Tooltip', () => {
  it('delays hover, dismisses with Escape and preserves an existing description', () => {
    vi.useFakeTimers();
    render(<Tooltip label="Inspect" shortcut="F"><button aria-describedby="existing">Open</button></Tooltip>);
    const trigger = screen.getByRole('button');
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(350));
    const hint = screen.getByRole('tooltip');
    expect(trigger.getAttribute('aria-describedby')).toContain(`existing ${hint.id}`);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-describedby', 'existing');
  });
  it('opens immediately on keyboard focus and cancels pending hover on departure', () => {
    vi.useFakeTimers();
    render(<Tooltip label="Inspect"><button>Open</button></Tooltip>);
    const trigger = screen.getByRole('button');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Inspect');
    fireEvent.blur(trigger);
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerLeave(trigger);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
