import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JobsMapView from './JobsMapView';

const state = vi.hoisted(() => ({ error: false }));
vi.mock('../../hooks/useQueries', () => ({
  useJobMapQuery: () => ({ isPending: false, isFetching: false, isError: state.error, refetch: vi.fn(),
    data: { total: 100, mapped: 90, in_view: 90, truncated: false, pins: [{ latitude: 0, longitude: 0,
      count: 1, job_ids: [42], title: 'Example Role', company: 'Example Company', domain: 'Example Domain', precision: 'city' }] },
  }),
}));
beforeEach(() => {
  state.error = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

describe('verified job map', () => {
  it('shows catalog coverage, precision and opens a pin through its job ID', () => {
    const select = vi.fn();
    render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={select} />);
    expect(screen.getByText('90 of 100 jobs have verified map locations')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Example Role · Example Company'));
    expect(screen.getByText('Location precision: city')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open job 42' }));
    expect(select).toHaveBeenCalledWith(42);
  });
  it('removes stale pins and shows retry when the query fails', () => {
    const { rerender } = render(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} />);
    state.error = true;
    rerender(<JobsMapView userId="synthetic-user" filters={{}} onSelectJob={vi.fn()} />);
    expect(screen.queryByTitle('Example Role · Example Company')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Job locations could not be loaded.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
