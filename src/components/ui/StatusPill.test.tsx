import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('renders all canonical statuses with appropriate labels', () => {
    const { rerender } = render(<StatusPill status="new" />);
    expect(screen.getByText('New')).toBeInTheDocument();

    rerender(<StatusPill status="applied" />);
    expect(screen.getByText('Applied')).toBeInTheDocument();

    rerender(<StatusPill status="interviewing" />);
    expect(screen.getByText('Interview')).toBeInTheDocument();

    rerender(<StatusPill status="interested" />);
    expect(screen.getByText('Interested')).toBeInTheDocument();

    rerender(<StatusPill status="not_interested" />);
    expect(screen.getByText('Not Interested')).toBeInTheDocument();
  });

  it('toggles dot visibility based on showDot prop', () => {
    const { container, rerender } = render(<StatusPill status="applied" showDot={true} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();

    rerender(<StatusPill status="applied" showDot={false} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
