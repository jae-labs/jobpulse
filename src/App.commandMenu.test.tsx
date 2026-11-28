import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// The command palette shortcut must be owned by the always-mounted shell, not by the
// lazily mounted palette itself. This integration test presses Cmd+K against the real App.
vi.mock('./hooks/useAuthSession', () => ({
  useAuthSession: () => ({
    session: { user: { id: 'synthetic-owner', email: 'owner@example.invalid' } },
    isAuthorized: true,
    authError: null,
    isAuthChecking: false,
  }),
}));

vi.mock('./hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useQueries')>();
  return {
    ...actual,
    useOverviewMetricsQuery: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
    useProfileQuery: () => ({ data: undefined, isLoading: false, error: null }),
    useUpdateJobStatusMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useSaveProfileMutation: () => ({ mutateAsync: vi.fn() }),
    useDeleteAccountMutation: () => ({ mutateAsync: vi.fn() }),
    useJobsPageQuery: () => ({ data: undefined, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useInvitationsQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), hasNextPage: false, fetchNextPage: vi.fn(), isFetchingNextPage: false }),
    useCreateInvitationMutation: () => ({ mutateAsync: vi.fn() }),
    useDeleteInvitationMutation: () => ({ mutateAsync: vi.fn() }),
  };
});

vi.mock('./components/dashboard/OverviewView', () => ({ OverviewView: () => null }));
vi.mock('./components/jobs/JobsView', () => ({ JobsView: () => null }));
vi.mock('./components/tax/TaxCalculatorView', () => ({ TaxCalculatorView: () => null }));
vi.mock('./components/privacy/PrivacyView', () => ({ PrivacyView: () => null }));
vi.mock('./components/profile/ProfileView', () => ({ ProfileView: () => null }));
vi.mock('./components/dashboard/ScoringProgress', () => ({ ScoringProgress: () => null }));

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/overview']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('command palette global shortcut', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens the palette with Cmd+K and closes it again', async () => {
    renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the palette with Ctrl+K', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
