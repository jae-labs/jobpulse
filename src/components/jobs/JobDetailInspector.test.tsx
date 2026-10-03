import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobDetailInspector } from './JobDetailInspector';
import type { Job } from '../../types/job';

const queryState = vi.hoisted(() => ({ loading: false, data: null as { description: string } | null }));
afterEach(() => { queryState.loading = false; queryState.data = null; });

vi.mock('../../hooks/useQueries', () => ({
  useUpdateJobSavedMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useJobDetailQuery: () => ({ data: queryState.data, isLoading: queryState.loading, isError: false, refetch: vi.fn() }),
}));

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
  description: 'Build platform services.',
  matched_skills: ['Kubernetes'],
  last_seen_at: '2026-09-25T00:00:00Z',
};

describe('JobDetailInspector', () => {
  it('shows an accessible loading state without retaining the previous specification', () => {
    const props = { onUpdateStatus: vi.fn().mockResolvedValue(undefined) };
    const { rerender } = render(<JobDetailInspector job={job} {...props} />);
    queryState.loading = true;
    const nextJob = { ...job, id: 2, title: 'Synthetic next role', description: undefined };
    rerender(<JobDetailInspector job={nextJob} {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Retrieving detailed job description');
    expect(screen.queryByText('Build platform services.')).not.toBeInTheDocument();
    queryState.loading = false;
    queryState.data = { description: 'The newly loaded specification.' };
    rerender(<JobDetailInspector job={{ ...nextJob }} {...props} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('The newly loaded specification.')).toBeInTheDocument();
  });
  it('keeps status button geometry stable when the selected opportunity changes', () => {
    const onUpdateStatus = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <JobDetailInspector job={job} onUpdateStatus={onUpdateStatus} />
    );
    const statusGroup = screen.getByRole('group', { name: 'Job status selection' });
    const buttons = within(statusGroup).getAllByRole('button');

    expect(buttons).toHaveLength(4);
    expect(within(statusGroup).queryByTitle('Saved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save job' })).toBeInTheDocument();
    for (const button of buttons) {
      expect(button).toHaveClass('border');
      expect(button).not.toHaveClass('transition-colors');
    }
    expect(within(statusGroup).getByTitle('New')).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <JobDetailInspector job={{ ...job, id: 2, status: 'applied' }} onUpdateStatus={onUpdateStatus} />
    );
    expect(within(statusGroup).getByTitle('Applied')).toHaveAttribute('aria-pressed', 'true');
    expect(within(statusGroup).getByTitle('New')).toHaveClass('border-transparent');
  });
});
