import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JobsMapView from './JobsMapView';

vi.mock('./JobsMapCanvas', () => ({ default: () => <div />, pinKey: (pin: { longitude: number; latitude: number }) => `${pin.longitude}:${pin.latitude}` }));

const state = vi.hoisted(() => ({ fetching: false, error: false, previewError: false, multiplePlaces: false, pageError: false, page: vi.fn() }));
const example = { id: 42, title: 'Example Role', company: 'Example Company', location: 'Dublin, Ireland' };
vi.mock('../../hooks/useQueries', () => ({
  useJobMapQuery: () => ({ isPending: false, isFetching: state.fetching, isError: state.error, refetch: vi.fn(),
    data: { total: 100, mapped: 90, in_view: 90, truncated: false, office_truncated: false,
      office_pins: [{ latitude: 53.34, longitude: -6.25, count: 1, job_ids: [42],
        title: 'Example Role', company: 'Example Company', domain: 'Example Domain', precision: 'company_office' }], pins: [{ latitude: 53.35, longitude: -6.26,
      count: 10, job_ids: [42], title: 'Example Role', company: 'Example Company', domain: 'Example Domain', precision: 'city' }] },
  }),
  useJobMapPreviewQuery: () => ({ isPending: false, isFetching: false, isError: state.previewError, refetch: vi.fn(), data: state.multiplePlaces ? [example, { ...example, id: 43, location: 'Galway, Ireland' }] : [example] }),
  useJobsPageQuery: (...args: unknown[]) => {
    state.page(...args);
    return { isPending: false, isFetching: false, isError: state.pageError, refetch: vi.fn(), data: { total: 42, items: [example] } };
  },
}));
beforeEach(() => {
  state.fetching = false;
  state.error = false;
  state.previewError = false;
  state.multiplePlaces = false;
  state.pageError = false;
  state.page.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

function openGroup() { fireEvent.click(screen.getByRole('button', { name: '10 jobs · Example Company · Example Role' })); }

describe('verified job map', () => {
  it('separates company offices from posting places and labels unconfirmed workplaces', () => {
    const selectLocation = vi.fn();
    render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} onSelectLocation={selectLocation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Company offices' }));
    expect(screen.getByText('Company office addresses; workplaces for these roles are unconfirmed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1 jobs · Example Company · Example Role' }));
    expect(screen.getByText('Location precision: company office (workplace unconfirmed)')).toBeInTheDocument();
    expect(selectLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Posting locations' }));
    expect(screen.queryByText('Location precision: company office (workplace unconfirmed)')).not.toBeInTheDocument();
  });
  it('keeps camera requests quiet and omits the map-group dropdown', () => {
    state.fetching = true;
    render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} />);
    expect(screen.queryByText('Loading verified job locations…')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('shows role and company labels, precision and opens the selected job without showing database IDs', () => {
    const select = vi.fn();
    render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={select} />);
    openGroup();
    expect(screen.getByText('Location precision: city')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Open job 42')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Example Role at Example Company/ }));
    expect(select).toHaveBeenCalledWith(42);
  });
  it('resolves a mobile dot to its stored posting location', () => {
    const selectLocation = vi.fn();
    render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} onSelectLocation={selectLocation} />);
    openGroup();
    expect(selectLocation).toHaveBeenCalledWith('Dublin, Ireland');
  });
  it('requires an explicit place for multi-location mobile groups and does not navigate on lookup failure', () => {
    state.multiplePlaces = true;
    const selectLocation = vi.fn();
    const { rerender } = render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} onSelectLocation={selectLocation} />);
    openGroup();
    expect(selectLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Browse all jobs in Galway, Ireland' }));
    expect(selectLocation).toHaveBeenCalledWith('Galway, Ireland');
    selectLocation.mockClear();
    state.multiplePlaces = false;
    state.previewError = true;
    rerender(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} onSelectLocation={selectLocation} />);
    expect(selectLocation).not.toHaveBeenCalled();
  });
  it('browses every page at the named location while preserving active catalog filters', () => {
    render(<JobsMapView userId="synthetic-user" filters={{ domain: 'Engineering', status: 'saved', search: 'Engineer' }} onSelectJob={vi.fn()} />);
    openGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Browse all jobs in Dublin, Ireland' }));
    expect(state.page).toHaveBeenLastCalledWith('synthetic-user', expect.objectContaining({ domain: 'Engineering', status: 'saved', search: 'Engineer', location: 'Dublin, Ireland', limit: 20, offset: 0 }), true);
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
    expect(screen.queryByRole('button', { name: '10 jobs · Example Company · Example Role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Job locations could not be loaded.');
  });
});
