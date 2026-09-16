import { useEffect, useCallback } from 'react';
import type { Job, JobStatus } from '../../types/job';
import { toSafeHttpUrl } from '../../lib/utils';

interface UseKeyboardNavigationOptions {
  displayedJobs: Job[];
  selectedJob: Job | null | undefined;
  onSelectJob: (job: Job | null) => void;
  onUpdateStatus?: (job: Job, status: JobStatus) => Promise<void>;
  isDetailFullScreen: boolean;
  setIsDetailFullScreen: React.Dispatch<React.SetStateAction<boolean>>;
  layoutMode: 'split' | 'list';
  updateUrlParam: (key: string, value: string | null) => void;
  scrollToIndex?: (
    index: number,
    options?: { align?: 'auto' | 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }
  ) => void;
}

export function useKeyboardNavigation({
  displayedJobs,
  selectedJob,
  onSelectJob,
  onUpdateStatus,
  isDetailFullScreen,
  setIsDetailFullScreen,
  layoutMode,
  updateUrlParam,
  scrollToIndex,
}: UseKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="button"]'
        )
      ) {
        return;
      }

      // In full-screen reading mode, arrow and page keys scroll the active opportunity's details
      if (isDetailFullScreen) {
        const dialog = document.getElementById('fullscreen-job-dialog');
        const scrollContainer =
          dialog?.querySelector<HTMLElement>('[data-inspector-scroll-body]') ||
          dialog?.querySelector<HTMLElement>('.overflow-y-auto');

        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: 80 });
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: -80 });
          return;
        }
        if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: 400 });
          return;
        }
        if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: -400 });
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          if (scrollContainer) scrollContainer.scrollTop = 0;
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
          return;
        }
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = displayedJobs.findIndex((j) => j.id === selectedJob?.id);
        const nextIndex = currentIndex < displayedJobs.length - 1 ? currentIndex + 1 : 0;
        const nextJob = displayedJobs[nextIndex];
        if (nextJob) {
          onSelectJob(nextJob);
          updateUrlParam('job', String(nextJob.id));
          if (window.scrollY < 70) {
            window.scrollTo({ top: 80, behavior: 'smooth' });
          }
          scrollToIndex?.(nextIndex, { align: 'auto', behavior: 'smooth' });
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = displayedJobs.findIndex((j) => j.id === selectedJob?.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : displayedJobs.length - 1;
        const prevJob = displayedJobs[prevIndex];
        if (prevJob) {
          onSelectJob(prevJob);
          updateUrlParam('job', String(prevJob.id));
          if (window.scrollY < 70) {
            window.scrollTo({ top: 80, behavior: 'smooth' });
          }
          scrollToIndex?.(prevIndex, { align: 'auto', behavior: 'smooth' });
        }
      } else if (e.key === 'Enter' && selectedJob) {
        const safeUrl = toSafeHttpUrl(selectedJob.url);
        if (safeUrl) {
          window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (e.key === 'a' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'applied');
      } else if (e.key === 'i' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'interviewing');
      } else if ((e.key === 't' || e.key === 'o') && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'interested');
      } else if ((e.key === 'n' || e.key === 'x') && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'not_interested');
      } else if ((e.key === 'f' || e.key === 'F') && selectedJob) {
        e.preventDefault();
        setIsDetailFullScreen((prev) => {
          const next = !prev;
          if (!next && layoutMode === 'list') {
            onSelectJob(null);
            updateUrlParam('job', null);
          }
          return next;
        });
      } else if (e.key === 'Escape') {
        if (isDetailFullScreen) {
          setIsDetailFullScreen(false);
          if (layoutMode === 'list') {
            onSelectJob(null);
            updateUrlParam('job', null);
          }
        }
      }
    },
    [
      displayedJobs,
      selectedJob,
      onSelectJob,
      onUpdateStatus,
      isDetailFullScreen,
      setIsDetailFullScreen,
      layoutMode,
      updateUrlParam,
      scrollToIndex,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
