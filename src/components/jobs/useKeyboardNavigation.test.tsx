import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardNavigation } from './useKeyboardNavigation';
import type { Job, JobStatus } from '../../types/job';

const mockJobs: Job[] = [
  {
    id: 1,
    title: 'Job One',
    company: 'Company A',
    location: 'Dublin',
    employment_type: 'Full-time',
    role_domain: 'Engineering',
    url: 'https://example.com/1',
    source: 'test',
    status: 'new',
    relevance: 90,
    salary_text: null,
    matched_skills: ['React', 'TypeScript'],
    last_seen_at: '2026-09-24T00:00:00Z',
  },
  {
    id: 2,
    title: 'Job Two',
    company: 'Company B',
    location: 'Cork',
    employment_type: 'Full-time',
    role_domain: 'Product',
    url: 'https://example.com/2',
    source: 'test',
    status: 'new',
    relevance: 80,
    salary_text: null,
    matched_skills: ['Product Management'],
    last_seen_at: '2026-09-24T00:00:00Z',
  },
];

describe('useKeyboardNavigation', () => {
  let onSelectJob: ReturnType<typeof vi.fn<(job: Job | null) => void>>;
  let onUpdateStatus: ReturnType<typeof vi.fn<(job: Job, status: JobStatus) => Promise<void>>>;
  let setIsDetailFullScreen: ReturnType<typeof vi.fn<React.Dispatch<React.SetStateAction<boolean>>>>;
  let updateUrlParam: ReturnType<typeof vi.fn<(key: string, value: string | null) => void>>;
  let scrollToIndex: ReturnType<
    typeof vi.fn<
      (
        index: number,
        options?: { align?: 'auto' | 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }
      ) => void
    >
  >;

  beforeEach(() => {
    onSelectJob = vi.fn<(job: Job | null) => void>();
    onUpdateStatus = vi.fn<(job: Job, status: JobStatus) => Promise<void>>().mockResolvedValue(undefined);
    setIsDetailFullScreen = vi.fn<React.Dispatch<React.SetStateAction<boolean>>>();
    updateUrlParam = vi.fn<(key: string, value: string | null) => void>();
    scrollToIndex = vi.fn<
      (
        index: number,
        options?: { align?: 'auto' | 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }
      ) => void
    >();
  });

  it('navigates to next job with "j" or "ArrowDown" when active target is a job card button', () => {
    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split',
        updateUrlParam,
        scrollToIndex,
      })
    );

    const cardButton = document.createElement('button');
    cardButton.setAttribute('data-job-card', 'true');
    document.body.appendChild(cardButton);
    cardButton.focus();

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true });
    cardButton.dispatchEvent(event);

    expect(onSelectJob).toHaveBeenCalledWith(mockJobs[1]);
    expect(updateUrlParam).toHaveBeenCalledWith('job', '2');
    document.body.removeChild(cardButton);
  });

  it('updates job status when focused on job card and pressing status shortcut keys', () => {
    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split',
        updateUrlParam,
        scrollToIndex,
      })
    );

    const cardButton = document.createElement('button');
    cardButton.setAttribute('data-job-card', 'true');
    document.body.appendChild(cardButton);
    cardButton.focus();

    // 'a' for applied
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    cardButton.dispatchEvent(event);

    expect(onUpdateStatus).toHaveBeenCalledWith(mockJobs[0], 'applied');
    document.body.removeChild(cardButton);
  });

  it('ignores shortcuts when user is focused inside a text input or textarea', () => {
    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split',
        updateUrlParam,
        scrollToIndex,
      })
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true });
    input.dispatchEvent(event);

    expect(onSelectJob).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('ignores shortcuts when focused on a non-card interactive button', () => {
    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split',
        updateUrlParam,
        scrollToIndex,
      })
    );

    const regularButton = document.createElement('button');
    document.body.appendChild(regularButton);
    regularButton.focus();

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true });
    regularButton.dispatchEvent(event);

    expect(onSelectJob).not.toHaveBeenCalled();
    document.body.removeChild(regularButton);
  });
});
