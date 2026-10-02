import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JobsMapView from './JobsMapView';

const state = vi.hoisted(() => ({ error: false, previewError: false, pageError: false, page: vi.fn() }));
const example = { id: 42, title: 'Example Role', company: 'Example Company', location: 'Dublin, Ireland' };
vi.mock('../../hooks/useQueries', () => ({
  useJobMapQuery: () => ({ isPending: false, isFetching: false, isError: state.error, refetch: vi.fn(),
    data: { total: 100, mapped: 90, in_view: 90, truncated: false, pins: [{ latitude: 53.35, longitude: -6.26,
      count: 10, job_ids: [42], title: 'Example Role', company: 'Example Company', domain: 'Example Domain', precision: 'city' }] },
  }),
  useJobMapPreviewQuery: () => ({ isPending: false, isFetching: false, isError: state.previewError, refetch: vi.fn(), data: [example] }),
  useJobsPageQuery: (...args: unknown[]) => {
    state.page(...args);
    return { isPending: false, isFetching: false, isError: state.pageError, refetch: vi.fn(), data: { total: 42, items: [example] } };
  },
}));
beforeEach(() => {
  state.error = false;
  state.previewError = false;
  state.pageError = false;
  state.page.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

function openGroup() { fireEvent.click(screen.getByRole('button', { name: '10 opportunities' })); }

describe('verified job map', () => {
  it('shows role and company labels, precision and opens the selected job without showing database IDs', () => {
    const select = vi.fn();
    render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={select} />);
    expect(screen.getByText('90 of 100 jobs have verified map locations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ireland' })).toBeInTheDocument();
    openGroup();
    expect(screen.getByText('Location precision: city')).toBeInTheDocument();
    expect(screen.queryByText('Open job 42')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Example Role at Example Company/ }));
    expect(select).toHaveBeenCalledWith(42);
  });
  it('browses every page at the named location while preserving active catalog filters', () => {
    render(<JobsMapView userId="synthetic-user" filters={{ domain: 'Engineering', status: 'interested', search: 'Engineer' }} onSelectJob={vi.fn()} />);
    openGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Browse all jobs in Dublin, Ireland' }));
    expect(state.page).toHaveBeenLastCalledWith('synthetic-user', expect.objectContaining({ domain: 'Engineering', status: 'interested', search: 'Engineer', location: 'Dublin, Ireland', limit: 20, offset: 0 }), true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(state.page).toHaveBeenLastCalledWith('synthetic-user', expect.objectContaining({ offset: 20 }), true);
    fireEvent.click(screen.getByRole('button', { name: 'Close location jobs' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
  it('hides stale location results and exposes retry after a jobs query failure', () => {
    const filters = {};
    const { rerender } = render(<JobsMapView userId="synthetic-user" filters={filters} onSelectJob={vi.fn()} />);
    openGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Browse all jobs in Dublin, Ireland' }));
    state.pageError = true;
    rerender(<JobsMapView userId="synthetic-user" filters={filters} onSelectJob={vi.fn()} />);
    expect(screen.queryByText('Example Role')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Jobs at this location could not be loaded.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('removes stale pins and location selections when the map query fails', () => {
    const { rerender } = render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} />);
    openGroup();
    state.error = true;
    rerender(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '10 opportunities' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Job locations could not be loaded.');
  });
});
