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

  const renderJobsView = (
    initialEntries: string[] = ['/opportunities'],
    selectedJob: any = null
  ) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <JobsView onSelectJob={vi.fn()} userEmail="user@example.com" selectedJob={selectedJob} />
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
    expect(screen.getByRole('option', { name: /Ireland \(National \/ Remote\)/ })).toBeInTheDocument();
  });

  it('displays matching item counts between parentheses on all dropdown options', () => {
    renderJobsView();

    // Match score dropdown options have counts
    expect(screen.getByRole('option', { name: 'All Matches (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '75%+ Match (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '55%+ Match (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '35%+ Match (1)' })).toBeInTheDocument();

    // Domain dropdown options have counts
    expect(screen.getByRole('option', { name: 'All Domains (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cloud (1)' })).toBeInTheDocument();

    // Salary dropdown options have counts
    expect(screen.getByRole('option', { name: 'All Salaries (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Disclosed only (1)' })).toBeInTheDocument();

    // Location regional hubs and loaded results have counts
    expect(screen.getByRole('option', { name: 'All Locations (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dublin (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cork (0)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ireland (National / Remote) (0)' })).toBeInTheDocument();
  });

  it('displays two arrows when nothing is clicked and toggles match sort direction on click', () => {
    renderJobsView();

    const sortButton = screen.getByRole('button', { name: /sort by match score/i });
    expect(sortButton).toBeInTheDocument();

    // Initially when nothing is clicked, shows ArrowUpDown (two arrows)
    expect(sortButton.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();
    expect(sortButton.querySelector('.lucide-arrow-down')).toBeNull();
    expect(sortButton.querySelector('.lucide-arrow-up')).toBeNull();

    // First click: activates match sort (descending for highest match first)
    fireEvent.click(sortButton);
    expect(sortButton.querySelector('.lucide-arrow-up-down')).toBeNull();
    expect(sortButton.querySelector('.lucide-arrow-down')).toBeInTheDocument();

    // Second click: toggles direction to ascending (lowest match first)
    fireEvent.click(sortButton);
    expect(sortButton.querySelector('.lucide-arrow-down')).toBeNull();
    expect(sortButton.querySelector('.lucide-arrow-up')).toBeInTheDocument();

    // Third click: toggles direction back to descending
    fireEvent.click(sortButton);
    expect(sortButton.querySelector('.lucide-arrow-down')).toBeInTheDocument();
  });

  it('renders sort buttons with two arrows on all dropdowns', () => {
    renderJobsView();

    const matchSort = screen.getByRole('button', { name: /sort by match score/i });
    const categorySort = screen.getByRole('button', { name: /sort by category/i });
    const salarySort = screen.getByRole('button', { name: /sort by salary/i });
    const locationSort = screen.getByRole('button', { name: /sort by location/i });

    expect(matchSort.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();
    expect(categorySort.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();
    expect(salarySort.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();
    expect(locationSort.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();

    // Clicking category sort activates category and sets ascending (A-Z)
    fireEvent.click(categorySort);
    expect(categorySort.querySelector('.lucide-arrow-up')).toBeInTheDocument();
    expect(matchSort.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();

    // Clicking salary sort activates salary and sets descending (highest salary first)
    fireEvent.click(salarySort);
    expect(salarySort.querySelector('.lucide-arrow-down')).toBeInTheDocument();
    expect(categorySort.querySelector('.lucide-arrow-up-down')).toBeInTheDocument();

    // Clicking salary sort again toggles to ascending
    fireEvent.click(salarySort);
    expect(salarySort.querySelector('.lucide-arrow-up')).toBeInTheDocument();
  });

  it('renders dropdowns without leading icon emojis', () => {
    const { container } = renderJobsView();

    // Ensure leading icons are absent from filter dropdown shells
    expect(container.querySelector('.lucide-sparkles')).toBeNull();
    expect(container.querySelector('.lucide-layers')).toBeNull();
    expect(container.querySelector('.lucide-banknote')).toBeNull();
    expect(container.querySelector('.lucide-map-pin')).toBeNull();
  });

  it('does not auto-focus the minimize button when opening full-screen dialog via "f"', () => {
    const mockJob = {
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
      status: 'new' as const,
      relevance: 95,
      last_seen_at: '2026-09-01T10:00:00Z',
      matched_skills: ['Kubernetes', 'Terraform'],
    };

    renderJobsView(['/opportunities?job=1'], mockJob);

    fireEvent.keyDown(window, { key: 'f' });

    const dialog = document.getElementById('fullscreen-job-dialog');
    expect(dialog).toBeInTheDocument();

    const exitButton = screen.queryByRole('button', { name: /exit full screen/i });
    expect(exitButton).toBeInTheDocument();
    expect(document.activeElement).not.toBe(exitButton);
    expect(document.activeElement).toBe(dialog);

    // Shortcut hint is rendered inside full-screen dialog
    expect(dialog).toHaveTextContent(/cycle/);
    expect(dialog).toHaveTextContent(/full screen/);
    expect(dialog).toHaveTextContent(/apply/);
    expect(dialog).toHaveTextContent(/status/);

    // Pressing 'f' a second time while in fullscreen closes the dialog
    fireEvent.keyDown(window, { key: 'f' });
    expect(document.getElementById('fullscreen-job-dialog')).toBeNull();
  });
});
