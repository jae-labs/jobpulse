import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JobsView } from './JobsView';

vi.mock('../../hooks/useQueries', () => ({
  useJobByIdQuery: () => ({ data: null, isLoading: false }),
  useJobDetailQuery: () => ({ data: null, isLoading: false, isError: false }),
  useUpdateJobStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useJobsInfiniteQuery: () => ({
    data: {
      pages: [
        {
          items: [
            {
              id: 1,
              title: 'DevOps Platform Engineer',
              company: 'Cloud Corp',
              location: 'Dublin',
              employment_type: 'Permanent',
              role_domain: 'Cloud',
              salary_text: '€90,000',
              description: 'DevOps engineering role',
              url: 'https://example.com/jobs/1',
              source: 'direct',
              status: 'new',
              relevance: 95,
              last_seen_at: '2026-09-01T10:00:00Z',
              matched_skills: ['Kubernetes', 'Terraform'],
            },
          ],
          total: 1,
          hasMore: false,
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));

describe('JobsView Search Input', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderJobsView = (initialEntries: string[] = ['/opportunities']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <JobsView onSelectJob={vi.fn()} userEmail="user@example.com" />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('allows user to type without losing focus or cursor jumping', async () => {
    renderJobsView();

    const searchInput = screen.getByRole('searchbox', { name: 'Search opportunities' }) as HTMLInputElement;
    expect(searchInput).toBeInTheDocument();

    // Type "devops" letter by letter
    fireEvent.change(searchInput, { target: { value: 'd' } });
    expect(searchInput.value).toBe('d');

    fireEvent.change(searchInput, { target: { value: 'de' } });
    expect(searchInput.value).toBe('de');

    fireEvent.change(searchInput, { target: { value: 'devops' } });
    expect(searchInput.value).toBe('devops');
  });

  it('shows clear button when search has text and clears on click', async () => {
    renderJobsView();

    const searchInput = screen.getByRole('searchbox', { name: 'Search opportunities' }) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'platform' } });
    expect(searchInput.value).toBe('platform');

    const clearBtn = screen.getByRole('button', { name: /clear search query/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(searchInput.value).toBe('');
    expect(screen.queryByRole('button', { name: /clear search query/i })).not.toBeInTheDocument();
  });

  it('labels the location groups and keeps regional filters available', () => {
    renderJobsView();

    const locations = screen.getByRole('combobox', { name: 'All Locations' });
    expect(locations.querySelector('optgroup[label="Regional Hubs"]')).not.toBeNull();
    expect(locations.querySelector('optgroup[label="Locations in loaded results"]')).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Ireland (National / Remote)' })).toBeInTheDocument();
  });
});
