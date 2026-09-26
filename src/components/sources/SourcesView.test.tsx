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
    expect(screen.getByText(/showing/i)).toBeInTheDocument();
    expect(screen.getByText(/opportunities reported/i)).toBeInTheDocument();
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

  it('displays two arrows when nothing is clicked and toggles direction on click', () => {
    render(<SourcesView sources={mockSources} />);

    const sortSelect = screen.getByRole('combobox', { name: /sort sources by/i });
    expect(sortSelect).toBeInTheDocument();
    expect(sortSelect).toHaveValue('opportunities');

    const toggleButton = screen.getByRole('button', { name: /toggle sort direction/i });
    expect(toggleButton).toBeInTheDocument();

    // Initially when nothing is clicked, shows ArrowUpDown (two arrows)
    expect(toggleButton.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();
    expect(toggleButton.querySelector('.lucide-arrow-down')).toBeNull();
    expect(toggleButton.querySelector('.lucide-arrow-up')).toBeNull();

    // First click: toggles direction to ascending
    fireEvent.click(toggleButton);
    expect(toggleButton.querySelector('.lucide-arrow-up-down')).toBeNull();
    expect(toggleButton.querySelector('.lucide-arrow-up')).toBeInTheDocument();

    // Second click: toggles direction to descending
    fireEvent.click(toggleButton);
    expect(toggleButton.querySelector('.lucide-arrow-down')).toBeInTheDocument();

    // Changing select resets to two arrows when new field is chosen
    fireEvent.change(sortSelect, { target: { value: 'name' } });
    expect(sortSelect).toHaveValue('name');
    expect(toggleButton.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();
  });
});
