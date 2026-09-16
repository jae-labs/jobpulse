import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileView } from './ProfileView';
import type { Profile } from '../../types/job';

vi.mock('../../hooks/useQueries', () => ({
  useUserCvsQuery: () => ({ data: [], isLoading: false }),
  useUserCoverLettersQuery: () => ({ data: [], isLoading: false }),
  useSaveCvMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCvMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveCoverLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCoverLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveAvatarMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockProfile: Profile = {
  name: 'Alex Mercer',
  first_name: 'Alex',
  last_name: 'Mercer',
  phone: '+353 87 123 4567',
  linkedin_url: 'https://linkedin.com/in/alexmercer',
  work_authorization: 'EU Citizen',
  gender: 'Prefer not to say',
  current_role: 'Lead Cloud Architect',
  location: 'Dublin, Ireland',
  target_roles: ['Staff Engineer', 'Principal Architect'],
  target_locations: ['Dublin', 'Remote'],
  work_mode: 'Hybrid, Remote',
  minimum_salary: 110000,
  salary_min: 110000,
  employment: 'Permanent only',
  education: 'B.Sc. Computer Science',
  certifications: 'AWS Solutions Architect, CKA',
  languages: ['English'],
  tools_software: ['Kubernetes', 'Go', 'Terraform'],
  summary: 'Experienced cloud architect specializing in distributed systems.',
  keywords: ['distributed systems', 'high throughput'],
};

describe('ProfileView', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderProfileView = (props: Partial<React.ComponentProps<typeof ProfileView>> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ProfileView
          profile={mockProfile}
          onSaveProfile={vi.fn().mockResolvedValue({ success: true })}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('renders loading state when isLoading is true', () => {
    renderProfileView({ isLoading: true, profile: null });
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });

  it('renders error state when loadError is present', () => {
    renderProfileView({ loadError: 'Database connection failed', profile: null });
    expect(screen.getByRole('alert')).toHaveTextContent('Database connection failed');
  });

  it('renders profile data correctly into inputs', () => {
    renderProfileView();
    expect(screen.getByDisplayValue('Alex')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mercer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lead Cloud Architect')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://linkedin.com/in/alexmercer')).toBeInTheDocument();
  });

  it('triggers onSaveProfile when input value is edited after debounce', async () => {
    const handleSave = vi.fn().mockResolvedValue({ success: true });
    renderProfileView({ onSaveProfile: handleSave });

    const roleInput = screen.getByDisplayValue('Lead Cloud Architect');
    fireEvent.change(roleInput, { target: { value: 'Principal Platform Engineer' } });

    expect(handleSave).not.toHaveBeenCalled();

    await waitFor(
      () => {
        expect(handleSave).toHaveBeenCalledWith(
          expect.objectContaining({
            current_role: 'Principal Platform Engineer',
          })
        );
      },
      { timeout: 2000 }
    );
  });

  it('displays error message when onSaveProfile fails', async () => {
    const handleSave = vi.fn().mockResolvedValue({
      success: false,
      error: 'Network error saving profile',
    });
    renderProfileView({ onSaveProfile: handleSave });

    const roleInput = screen.getByDisplayValue('Lead Cloud Architect');
    fireEvent.change(roleInput, { target: { value: 'Engineering Director' } });

    await waitFor(
      () => {
        expect(screen.getByText('Network error saving profile')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('toggles work mode and triggers save', async () => {
    const handleSave = vi.fn().mockResolvedValue({ success: true });
    renderProfileView({ onSaveProfile: handleSave });

    // Click Remote work mode pill/button to toggle it
    const hybridButton = screen.getAllByRole('button', { name: /hybrid/i })[0];
    if (hybridButton) {
      fireEvent.click(hybridButton);
    }

    await waitFor(
      () => {
        expect(handleSave).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });
});
