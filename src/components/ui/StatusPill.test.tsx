import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill, MatchScoreBadge } from './StatusPill';

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
    const { container, rerender } = render(<StatusPill status="applied" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();

    rerender(<StatusPill status="applied" showDot={true} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();

    rerender(<StatusPill status="applied" showDot={false} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('renders match score badge with semantic warning tokens for high score', () => {
    const { container } = render(<MatchScoreBadge score={85} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/match/i)).toBeInTheDocument();
    expect(screen.queryByText(/fit/i)).toBeNull();
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('border-ds-warning-border');
    expect(badge.className).toContain('bg-ds-warning-subtle');
  });

  it('renders match score badge with muted tokens for lower scores', () => {
    const { container } = render(<MatchScoreBadge score={40} />);
    expect(screen.getByText('40%')).toBeInTheDocument();
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('border-ds-border-strong');
  });
});
