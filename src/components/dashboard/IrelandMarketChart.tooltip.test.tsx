import { cloneElement, type ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IrelandMarketChart } from './IrelandMarketChart';

// Give the real Recharts chart a measurable viewport in jsdom.
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
      cloneElement(children, { width: 600, height: 240 }),
  };
});

describe('Ireland chart tooltip dismissal', () => {
  it.each(['ireland-pay-chart', 'ireland-labour-chart'] as const)('keeps exact values keyboard-accessible in %s without a table', (id) => {
    render(<IrelandMarketChart id={id} />);
    const chart = screen.getByRole('application');
    fireEvent.focus(chart);
    for (let index = 0; index < 10; index++) fireEvent.keyDown(chart, { key: 'ArrowRight' });
    const tooltip = document.querySelector('.recharts-tooltip-wrapper')!;
    expect(tooltip).toHaveTextContent('Q2 2026');
    expect(tooltip).toHaveStyle({ visibility: 'visible' });
    if (id === 'ireland-pay-chart') {
      expect(tooltip).toHaveTextContent('€54,438');
      expect(tooltip).toHaveTextContent('€28,696');
      fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
      fireEvent.focus(chart);
      fireEvent.keyDown(chart, { key: 'ArrowRight' });
      expect(tooltip).toHaveTextContent('€14.15');
      expect(tooltip).toHaveTextContent('€31.96');
    } else {
      expect(tooltip).toHaveTextContent('2,990,200');
      expect(tooltip).toHaveTextContent('151,000');
      expect(tooltip).toHaveTextContent('30,000');
    }
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('View data')).not.toBeInTheDocument();
  });

  it.each(['ireland-pay-chart', 'ireland-labour-chart'] as const)('dismisses %s outside the plot and allows another selection', (id) => {
    render(<><button>Outside chart</button><IrelandMarketChart id={id} /></>);
    const chart = screen.getByRole('application');
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    const tooltip = document.querySelector('.recharts-tooltip-wrapper')!;
    expect(tooltip).toHaveStyle({ visibility: 'visible' });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside chart' }), { pointerType: 'touch' });
    expect(tooltip).toHaveStyle({ visibility: 'hidden' });
    // A synthetic mouse move after a touch must not restore a dismissed tooltip.
    fireEvent.mouseMove(document.body);
    expect(tooltip).toHaveStyle({ visibility: 'hidden' });

    fireEvent.pointerDown(chart, { pointerType: 'touch' });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(tooltip).toHaveStyle({ visibility: 'visible' });
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(tooltip).toHaveStyle({ visibility: 'hidden' });
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(tooltip).toHaveStyle({ visibility: 'visible' });
    fireEvent.blur(chart, { relatedTarget: screen.getByRole('button', { name: 'Outside chart' }) });
    expect(tooltip).toHaveStyle({ visibility: 'hidden' });
  });
});
