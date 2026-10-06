import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pill } from './Pill';

describe('Pill', () => {
  it('renders label and formatted count', () => {
    render(<Pill label="New" count="5,225" />);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('5,225')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Pill label="Applied" onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('maps a chart tone to a semantic CSS token', () => {
    const { container } = render(
      <Pill label="Engineering" tone="chart-6" />,
    );
    const button = container.querySelector('button');
    expect(button?.style.getPropertyValue('--pill-color')).toBe(
      'var(--ds-color-chart-6)',
    );
  });

  it('supports active state styling', () => {
    const { rerender } = render(<Pill label="All" active={false} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('text-ds-text-secondary');

    rerender(<Pill label="All" active={true} />);
    expect(button.className).toContain('font-semibold');
  });

  it('renders as custom element with asChild', () => {
    render(
      <Pill asChild label="Tag">
        <span>Custom Span</span>
      </Pill>,
    );
    expect(screen.getByText('Custom Span').tagName).toBe('SPAN');
  });
});
