import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandMenu } from './CommandMenu';
import type { Job } from '../../types/job';

vi.mock('../../hooks/useQueries', () => ({
  useJobsPageQuery: () => ({ data: undefined }),
}));

describe('CommandMenu', () => {
  it('shows positions without a heading and opens a selected position', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const job: Job = {
      id: 1,
      title: 'Platform Engineer',
      company: 'Acme',
      location: 'Dublin',
      employment_type: 'Full-time',
      role_domain: 'Engineering',
      url: 'https://example.com/job',
      source: 'test',
      status: 'new',
      relevance: 90,
      salary_text: null,
      matched_skills: ['Kubernetes'],
      last_seen_at: '2026-09-25T00:00:00Z',
    };
    const onSelectJob = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandMenu
        isOpen
        onOpenChange={onOpenChange}
        onSelectJob={onSelectJob}
        jobs={[job]}
      />
    );

    expect(screen.queryByText('Matching positions')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search roles, companies, skills...')).toBeInTheDocument();
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Filter positions')).not.toBeInTheDocument();
    expect(screen.queryByText('Preferences and sync')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Platform Engineer'));
    expect(onSelectJob).toHaveBeenCalledWith(job);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
