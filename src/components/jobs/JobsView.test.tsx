import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JobsView } from './JobsView';
import type { Job } from '../../types/job';
import { useState } from 'react';
const linked = vi.hoisted(() => ({ data: null as Job | null, jobs: null as Job[] | null }));

vi.mock('./JobsMapView', () => ({ default: ({ onSelectLocation }: { onSelectLocation?: (location: string) => void }) => <section aria-label="Synthetic map view">{onSelectLocation ? <button onClick={() => onSelectLocation("Dublin")}>Synthetic Dublin dot</button> : null}</section> }));

vi.mock('../../hooks/useQueries', () => ({
  useJobByIdQuery: () => ({ data: linked.data, isLoading: false }),
  useUpdateJobSavedMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useUpdateJobStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useJobsInfiniteQuery: () => ({
    data: {
      pages: [
        {
          items: linked.jobs ?? [
            {
              id: 1,
              title: 'DevOps Platform Engineer',
              company: 'Cloud Corp',
              location: 'Dublin',
              employment_type: 'Permanent',
              role_sector: 'Cloud',
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
          total: linked.jobs?.length ?? 1,
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
  afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); });
  let queryClient: QueryClient;

  beforeEach(() => {
    linked.data = null;
    linked.jobs = null;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderJobsView = (
    initialEntries: string[] = ['/opportunities'],
    selectedJob: Job | null = null
  ) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <JobsView onSelectJob={vi.fn()} userId="user@example.com" selectedJob={selectedJob} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('exposes an accessible posting availability filter with explicit history scope', () => {
    renderJobsView(['/opportunities']);
    const filter = screen.getByRole('combobox', { name: 'Posting availability' });
    expect(filter).toHaveValue('active');
    fireEvent.change(filter, { target: { value: 'unverified' } });
    expect(filter).toHaveValue('unverified');
    expect(screen.getByRole('option', { name: 'Confirmed closed' })).toBeInTheDocument();
  });

  it('refreshes the inspector heart from the owner-scoped job query instead of a stale selected snapshot', () => {
    const snapshot: Job = { id: 1, title: 'Synthetic job', company: 'Synthetic company', status: 'applied', is_saved: false, relevance: 0, location: 'Dublin', employment_type: 'Full time', salary_text: null, matched_skills: [], url: 'https://example.invalid', source: 'Synthetic', last_seen_at: '2026-01-01' };
    linked.data = { ...snapshot, is_saved: true };
    renderJobsView(['/opportunities'], snapshot);
    expect(screen.getByRole('button', { name: 'Unstar job' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a compact cold deep link after its job arrives outside the first page', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const Location = () => <output data-testid="location">{useLocation().search}</output>;
    const ColdLink = () => {
      const [selectedJob, selectJob] = useState<Job | null>(null);
      return <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/opportunities?job=99']}>
        <JobsView userId="synthetic-owner" selectedJob={selectedJob} onSelectJob={selectJob} />
        <Location />
      </MemoryRouter></QueryClientProvider>;
    };
    const view = render(<ColdLink />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    linked.data = { id: 99, title: 'Delayed synthetic vacancy', company: 'Synthetic', status: 'new', relevance: 0,
      location: 'Dublin', employment_type: 'Full time', salary_text: null, matched_skills: [],
      url: 'https://example.invalid/99', source: 'test', last_seen_at: '2026-10-03' };
    view.rerender(<ColdLink />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Delayed synthetic vacancy');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Opportunity details');
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).not.toHaveTextContent('job=');
  });

  it.each([false, true])('keeps list arrow navigation out of fullscreen (compact: %s)', (compact) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: compact && query === '(max-width: 1023px)',
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    const first: Job = { id: 1, title: 'Synthetic first vacancy', company: 'Synthetic employer',
      location: 'Dublin', employment_type: 'Full time', status: 'new', relevance: 0,
      salary_text: null, matched_skills: [], url: 'https://example.invalid/1', source: 'test',
      last_seen_at: '2026-10-03' };
    const second: Job = { ...first, id: 2, title: 'Synthetic second vacancy', url: 'https://example.invalid/2' };
    linked.jobs = [first, second];
    const List = () => {
      const [selection, select] = useState<Job | null>(first);
      const location = useLocation();
      return <><JobsView userId="synthetic-owner" selectedJob={selection} onSelectJob={select} />
        <output data-testid="selection">{selection?.id}</output>
        <output data-testid="location">{location.search}</output></>;
    };
    render(<QueryClientProvider client={queryClient}><MemoryRouter><List /></MemoryRouter></QueryClientProvider>);
    if (!compact) fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByTestId('selection')).toHaveTextContent('2');
    expect(screen.getByTestId('location')).toHaveTextContent('job=2');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByTestId('selection')).toHaveTextContent('1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'f' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Synthetic first vacancy');
    expect(dialog).not.toHaveClass('ds-content-enter');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog).toHaveTextContent('Synthetic second vacancy');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog).toHaveTextContent('Synthetic first vacancy');
  });

  it('switches to map without displaying the loaded list count and restores list mode', async () => {
    renderJobsView();
    const map = screen.getByRole('button', { name: /Map/i });
    fireEvent.click(map);
    expect(await screen.findByRole('region', { name: 'Synthetic map view' })).toBeInTheDocument();
    expect(map).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /List/i }));
    expect(screen.queryByRole('region', { name: 'Synthetic map view' })).not.toBeInTheDocument();
    expect(screen.getByText(/^Showing/)).toBeInTheDocument();
  });

  it('returns a mobile map selection to a filtered list and scrolls/focuses the results', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    renderJobsView(['/opportunities?sector=Cloud&salary=specified&q=Engineer']);
    fireEvent.click(screen.getByRole('button', { name: /Map/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Dublin dot' }));
    expect(screen.queryByRole('region', { name: 'Synthetic map view' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'All Locations' })).toHaveValue('Dublin');
    expect(screen.getByRole('combobox', { name: 'All Sectors' })).toHaveValue('Cloud');
    expect(screen.getByRole('searchbox')).toHaveValue('Engineer');
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');
  });

  it('uses the sector URL filter and clears it', () => {
    renderJobsView(['/opportunities?sector=Synthetic%20Sector']);
    const sectors = screen.getByRole('combobox', { name: 'All Sectors' });
    expect(sectors).toHaveValue('Synthetic Sector');
    fireEvent.change(sectors, { target: { value: 'all' } });
    expect(sectors).toHaveValue('all');
  });

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

  it('clears the animated hint on focus and keeps it hidden while the search has text', () => {
    renderJobsView();
    const input = screen.getByRole('searchbox', { name: 'Search opportunities' });
    expect(screen.getByText('Search by')).toBeInTheDocument();
    fireEvent.focus(input);
    expect(screen.queryByText('Search by')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', '');
    fireEvent.change(input, { target: { value: 'Engineer' } });
    fireEvent.blur(input);
    expect(screen.queryByText('Search by')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search query' }));
    expect(screen.getByText('Search by')).toBeInTheDocument();
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
    expect(locations.querySelector('optgroup[label="Locations in loaded results"]')).toBeNull();
    expect(screen.getByRole('option', { name: /Ireland \(National \/ Remote\)/ })).toBeInTheDocument();
  });

  it('keeps filter labels free of counts inferred from a partial page', () => {
    renderJobsView();

    // Match score slider shows current value
    expect(screen.getByRole('slider', { name: 'Min Match' })).toHaveAttribute('aria-valuetext', 'All Matches');

    // Sector dropdown options have counts
    expect(screen.getByRole('option', { name: 'All Sectors (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cloud (1)' })).not.toBeInTheDocument();

    // Salary slider exposes its unfiltered meaning
    expect(screen.getByRole('slider', { name: 'Salary' })).toHaveAttribute('aria-valuetext', 'All Salaries');

    // Location regional hubs and loaded results have counts
    expect(screen.getByRole('option', { name: 'All Locations (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Dublin/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cork' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ireland (National / Remote)' })).toBeInTheDocument();
  });

  it('previews match changes and commits pointer and keyboard endpoints to the URL', () => {
    const CurrentFilters = () => <output data-testid="filters">{useLocation().search}</output>;
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/opportunities']}>
      <JobsView userId="synthetic-owner" onSelectJob={vi.fn()} />
      <CurrentFilters />
    </MemoryRouter></QueryClientProvider>);
    const slider = screen.getByRole('slider', { name: 'Min Match' });
    fireEvent.change(slider, { target: { value: '70' } });
    expect(slider).toHaveAttribute('aria-valuetext', '70%+');
    expect(screen.getByTestId('filters')).not.toHaveTextContent('match=70');
    fireEvent.pointerUp(slider);
    expect(screen.getByTestId('filters')).toHaveTextContent('match=70');
    fireEvent.change(slider, { target: { value: '100' } });
    fireEvent.keyUp(slider, { key: 'End' });
    expect(screen.getByTestId('filters')).toHaveTextContent('match=100');
    fireEvent.change(slider, { target: { value: '0' } });
    fireEvent.keyUp(slider, { key: 'Home' });
    expect(screen.getByTestId('filters')).toHaveTextContent('match=0');
  });

  it('supports both sliders and resets their thresholds', () => {
    renderJobsView();
    const match = screen.getByRole('slider', { name: 'Min Match' });
    const salary = screen.getByRole('slider', { name: 'Salary' });
    fireEvent.change(match, { target: { value: '75' } });
    expect(screen.getByRole('slider', { name: 'Min Match' })).toHaveValue('75');
    fireEvent.pointerUp(match);
    fireEvent.change(salary, { target: { value: '1' } });
    fireEvent.pointerUp(salary);
    expect(salary).toHaveAttribute('aria-valuetext', 'Disclosed only');
    fireEvent.change(salary, { target: { value: '8' } });
    fireEvent.keyUp(salary, { key: 'ArrowRight' });
    expect(salary).toHaveAttribute('aria-valuetext', '€70k+');
    fireEvent.change(salary, { target: { value: '2' } });
    fireEvent.pointerUp(salary);
    expect(salary).toHaveAttribute('aria-valuetext', '€10k+');
    fireEvent.change(salary, { target: { value: '31' } });
    fireEvent.keyUp(salary, { key: 'End' });
    expect(salary).toHaveAttribute('aria-valuetext', '€300k+');
    fireEvent.click(screen.getByRole('button', { name: /reset all filters/i }));
    expect(match).toHaveValue('0');
    expect(salary).toHaveValue('0');
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
      role_sector: 'Cloud',
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
    expect(dialog?.textContent).toMatch(/cycle/);
    expect(dialog?.textContent).toMatch(/full screen/);
    expect(dialog?.textContent).toMatch(/apply/);
    expect(dialog?.textContent).toMatch(/status/);

    // Pressing 'f' a second time while in fullscreen closes the dialog
    fireEvent.keyDown(window, { key: 'f' });
    expect(document.getElementById('fullscreen-job-dialog')).toBeNull();
  });
});
