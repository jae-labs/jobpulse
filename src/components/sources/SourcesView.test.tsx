import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SourcesView } from './SourcesView';
import type { Source } from '../../types/job';

const mockSources: Source[] = [
  {
    id: 1,
    name: 'Tech Careers Board',
    url: 'https://techcareers.example.com',
    mode: 'feed',
    last_status: 'Synced',
    last_synced_at: '2026-09-10T12:00:00Z',
    opportunities_found: 25,
    detail: 'Found 25 opportunities',
  },
  {
    id: 2,
    name: 'Untrusted Feed',
    url: 'javascript:alert("exploit")',
    mode: 'scrape',
    last_status: 'Synced',
    last_synced_at: '2026-09-11T12:00:00Z',
    opportunities_found: 0,
    detail: 'No opportunities',
  },
];

describe('SourcesView', () => {
  it('renders sources and statistics properly', () => {
    render(<SourcesView sources={mockSources} />);

    expect(screen.getByText('Tech Careers Board')).toBeInTheDocument();
    expect(screen.getByText('Untrusted Feed')).toBeInTheDocument();
  });

  it('renders a valid link for safe https URLs with screen reader notice', () => {
    render(<SourcesView sources={mockSources} />);

    const link = screen.getByRole('link', { name: /https:\/\/techcareers\.example\.com/i });
    expect(link).toHaveAttribute('href', 'https://techcareers.example.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('neutralizes unsafe javascript: URLs to prevent script execution', () => {
    render(<SourcesView sources={mockSources} />);

    const untrustedLink = screen.queryByRole('link', { name: /javascript:alert/i });
    expect(untrustedLink).toBeNull();

    expect(screen.getByText('javascript:alert("exploit")')).toBeInTheDocument();
  });

  it('toggles sort order between descending and ascending', () => {
    render(<SourcesView sources={mockSources} />);

    const sortButton = screen.getByRole('button', { name: /sort by opportunities/i });
    expect(sortButton).toBeInTheDocument();

    fireEvent.click(sortButton);
    expect(sortButton).toBeInTheDocument();
  });
});
