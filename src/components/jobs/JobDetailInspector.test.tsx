import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobDetailInspector } from './JobDetailInspector';
import type { Job } from '../../types/job';

vi.mock('../../hooks/useQueries', () => ({
  useJobDetailQuery: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
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
  it('keeps status button geometry stable when the selected opportunity changes', () => {
    const onUpdateStatus = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <JobDetailInspector job={job} onUpdateStatus={onUpdateStatus} />
    );
    const statusGroup = screen.getByRole('group', { name: 'Job status selection' });
    const buttons = within(statusGroup).getAllByRole('button');

    expect(buttons).toHaveLength(5);
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
