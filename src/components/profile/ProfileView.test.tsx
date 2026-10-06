import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileView } from './ProfileView';
import type { Job, Profile } from '../../types/job';
import i18n from '../../lib/i18n';

vi.mock('../../hooks/useQueries', () => ({
  useUserCvsQuery: () => ({ data: [], isLoading: false }),
  useUserCoverLettersQuery: () => ({ data: [], isLoading: false }),
  useSaveCvMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCvMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveCoverLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCoverLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveAvatarMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useScoringPreviewJobsQuery: () => ({ data: [], isLoading: false }),
}));

const mockProfile: Profile = {
  name: 'Alex Mercer',
  first_name: 'Alex',
  last_name: 'Mercer',
  phone: '+1 202 555 0100',
  linkedin_url: 'https://example.test/profile/synthetic-candidate',
  work_authorization: 'EU Citizen',
  current_role: 'Lead Cloud Architect',
  location: 'Dublin, Ireland',
  target_roles: ['Staff Engineer', 'Principal Architect'],
  target_locations: ['Dublin', 'Remote'],
  work_mode: 'Hybrid, Remote',
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('keeps account export and deletion on the Data and privacy page', () => {
    renderProfileView();
    expect(screen.queryByRole('button', { name: 'Export account data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Danger zone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });

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
    expect(screen.getByDisplayValue('https://example.test/profile/synthetic-candidate')).toBeInTheDocument();
  });

  it('keeps a live preview before the sliders and updates scores as weights change', () => {
    const previewJob: Job = {
      id: 1,
      title: 'Platform Engineer',
      company: 'Example Co',
      location: 'Dublin',
      employment_type: 'Permanent',
      salary_text: null,
      url: 'https://example.com/job',
      source: 'direct',
      status: 'new',
      relevance: 25,
      last_seen_at: '2026-09-25T10:00:00Z',
      matched_skills: [],
      sub_scores: {
        sector: 1.0,
        semantic: 0,
        competency: 0,
        seniority: 0,
        salary: 0,
        contract: 0,
        target_role: 0,
        location: 0,
        work_mode: 0,
        fixed_term: 0,
      },
    };
    const otherJobs: Job[] = Array.from({ length: 5 }, (_, index) => ({
      ...previewJob,
      id: index + 2,
      title: `Role ${index + 2}`,
      relevance: 23 - index * 2,
      sub_scores: { ...previewJob.sub_scores!, sector: 0, semantic: 0.9 - index * 0.1 },
    }));
    renderProfileView({ jobs: [previewJob, ...otherJobs] });

    const preview = screen.getByRole('complementary', { name: 'Estimated Match Score Preview' });
    const slider = screen.getByRole('slider', { name: 'Sector Match & Core Specialization' });
    expect(preview).toHaveClass('lg:sticky');
    expect(preview.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(preview).getByRole('list').children).toHaveLength(5);
    expect(within(preview).getByText('Platform Engineer').closest('li')).toHaveTextContent('20%');
    expect(within(preview).queryByText('Role 6')).not.toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '15' } });
    expect(within(preview).getByText('Platform Engineer').closest('li')).toHaveTextContent('15%');

    fireEvent.change(slider, { target: { value: '5' } });
    expect(within(preview).getByRole('list').children).toHaveLength(5);
    expect(within(preview).queryByText('Platform Engineer')).not.toBeInTheDocument();
    expect(within(preview).getByText('Role 6')).toBeInTheDocument();

    const positive = screen.getByRole('heading', { name: 'Matching Competencies, Tools & Keywords' });
    const weights = screen.getByRole('heading', { name: 'Scoring Weights & Point Distribution' });
    expect(positive.compareDocumentPosition(weights) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const summary = screen.getByRole('heading', { name: 'Career Objective & Summary' });
    const seniority = screen.getByRole('heading', { name: 'Seniority Rules' });
    const education = screen.getByRole('heading', { name: 'Education & Qualifications' });
    expect(summary.compareDocumentPosition(seniority) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(seniority.compareDocumentPosition(education) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('edits unified matching tags while preserving existing rule details', async () => {
    vi.useFakeTimers();
    const onSaveProfile = vi.fn().mockResolvedValue({ success: true });
    renderProfileView({
      onSaveProfile,
      profile: {
        ...mockProfile,
        scoring_rules: {
          positive_sectors: [{
            name: 'Cloud & Platform Engineering',
            keywords: ['Kubernetes', 'Terraform'],
            note: 'Core platform alignment',
          }],
          negative_sectors: [{
            name: 'UI focus',
            keywords: ['React', 'frontend'],
            reason: 'Client-side emphasis',
          }],
          seniority_tiers: [{
            name: 'Senior',
            keywords: ['Senior', 'Lead'],
            score_weight: 0.8,
            note: 'Experienced roles',
          }],
        },
      },
    });

    const positiveInput = screen.getByRole('textbox', { name: 'Matching Competencies, Tools & Keywords' });
    expect(screen.queryByRole('heading', { name: 'Positive Alignment Rules' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tools, Technologies & Software' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Matching Competencies & Keywords' })).not.toBeInTheDocument();
    fireEvent.change(positiveInput, { target: { value: 'Python' } });
    fireEvent.keyDown(positiveInput, { key: 'Enter' });
    fireEvent.click(within(positiveInput.parentElement!).getByRole('button', { name: 'Remove Terraform' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove React' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Senior' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const savedProfile = onSaveProfile.mock.lastCall?.[0];
    const savedRules = savedProfile.scoring_rules;
    expect(savedRules.positive_sectors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Cloud & Platform Engineering',
        keywords: ['Kubernetes'],
        note: 'Core platform alignment',
      }),
      { name: 'Python', keywords: ['Python'], note: '' },
    ]));
    expect(savedRules.positive_sectors.some((rule: { name: string }) => rule.name === 'Terraform')).toBe(false);
    expect(savedProfile.keywords).toEqual(expect.arrayContaining(['Python', 'Go', 'distributed systems']));
    expect(savedProfile.keywords).not.toContain('Terraform');
    expect(savedProfile.tools_software).not.toContain('Terraform');
    expect(savedRules.negative_sectors).toEqual([{
      name: 'UI focus',
      keywords: ['frontend'],
      reason: 'Client-side emphasis',
    }]);
    expect(savedRules.seniority_tiers).toEqual([{
      name: 'Lead',
      keywords: ['Lead'],
      score_weight: 0.8,
      note: 'Experienced roles',
    }]);
  });

  it('triggers onSaveProfile when input value is edited after debounce', async () => {
    vi.useFakeTimers();
    const handleSave = vi.fn().mockResolvedValue({ success: true });
    renderProfileView({ onSaveProfile: handleSave });

    const roleInput = screen.getByDisplayValue('Lead Cloud Architect');
    fireEvent.change(roleInput, { target: { value: 'Principal Platform Engineer' } });

    expect(handleSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        current_role: 'Principal Platform Engineer',
      })
    );
  });

  it('displays error message when onSaveProfile fails', async () => {
    vi.useFakeTimers();
    const handleSave = vi.fn().mockResolvedValue({
      success: false,
      error: 'Network error saving profile',
    });
    renderProfileView({ onSaveProfile: handleSave });

    const roleInput = screen.getByDisplayValue('Lead Cloud Architect');
    fireEvent.change(roleInput, { target: { value: 'Engineering Director' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.queryByText('Network error saving profile')).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('profile.autoSaveError'))).toBeInTheDocument();
  });

  it('toggles work mode and triggers save', async () => {
    vi.useFakeTimers();
    const handleSave = vi.fn().mockResolvedValue({ success: true });
    renderProfileView({ onSaveProfile: handleSave });

    // Click Remote work mode pill/button to toggle it
    const hybridButton = screen.getAllByRole('button', { name: /hybrid/i })[0];
    if (hybridButton) {
      fireEvent.click(hybridButton);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(handleSave).toHaveBeenCalled();
  });

  it('keeps unset work mode neutral and permits clearing the last preference', async () => {
    vi.useFakeTimers();
    const handleSave = vi.fn().mockResolvedValue({ success: true });
    renderProfileView({ profile: { ...mockProfile, work_mode: '' }, onSaveProfile: handleSave });
    const remote = screen.getAllByRole('button', { name: /^remote$/i })[0];
    fireEvent.click(remote);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(handleSave).toHaveBeenLastCalledWith(expect.objectContaining({ work_mode: 'Remote' }));
    fireEvent.click(remote);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(handleSave).toHaveBeenLastCalledWith(expect.objectContaining({ work_mode: '' }));
  });

  it('displays inline accessible alert when avatar file exceeds size limit', async () => {
    const windowAlertSpy = vi.spyOn(window, 'alert');
    renderProfileView();

    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const largeFile = new File(['x'.repeat(100)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(largeFile, 'size', { value: 3 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(windowAlertSpy).not.toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/2MB/i);

    windowAlertSpy.mockRestore();
  });

  it('renders correctly when profile scoring_rules is an empty object', () => {
    const profileWithEmptyRules: Profile = {
      ...mockProfile,
      scoring_rules: {} as any,
    };
    renderProfileView({ profile: profileWithEmptyRules });
    expect(screen.getByRole('heading', { name: 'Scoring Weights & Point Distribution' })).toBeInTheDocument();
  });

  it('keeps scoring weights at the end of Profile', () => {
    renderProfileView();
    const exclusion = screen.getByRole('heading', { name: 'Mismatch / Exclusion Rules' });
    const disqualifiers = screen.getByRole('heading', { name: 'Disqualifiers & Dealbreakers' });
    const weights = screen.getByRole('heading', { name: 'Scoring Weights & Point Distribution' });

    expect(exclusion.compareDocumentPosition(disqualifiers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disqualifiers.compareDocumentPosition(weights) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).at(-1)).toBe(weights);
  });
});
