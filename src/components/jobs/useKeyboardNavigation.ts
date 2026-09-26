import { useEffect, useCallback, useRef } from 'react';
import { STATUS_LIST, type Job, type JobStatus } from '../../types/job';
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
  cardRefs?: React.RefObject<Map<number, HTMLElement>>;
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
  cardRefs,
}: UseKeyboardNavigationOptions) {
  const optionsRef = useRef({
    displayedJobs,
    selectedJob,
    onSelectJob,
    onUpdateStatus,
    isDetailFullScreen,
    setIsDetailFullScreen,
    layoutMode,
    updateUrlParam,
    scrollToIndex,
    cardRefs,
  });
  useEffect(() => {
    optionsRef.current = {
      displayedJobs,
      selectedJob,
      onSelectJob,
      onUpdateStatus,
      isDetailFullScreen,
      setIsDetailFullScreen,
      layoutMode,
      updateUrlParam,
      scrollToIndex,
      cardRefs,
    };
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const {
        displayedJobs,
        selectedJob,
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen,
        setIsDetailFullScreen,
        layoutMode,
        updateUrlParam,
        scrollToIndex,
        cardRefs,
      } = optionsRef.current;
      const target = e.target instanceof Element ? e.target : null;
      const isInput = target?.closest(
        'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"]'
      );
      const isSidebarArrowNavigation =
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        Boolean(target?.closest('[data-dashboard-navigation] a'));
      const isInteractiveElement =
        !isDetailFullScreen &&
        !isSidebarArrowNavigation &&
        target?.closest(
          'button:not([data-job-card]), a, [role="button"]:not([data-job-card])'
        );

      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isInput ||
        isInteractiveElement
      ) {
        return;
      }

      // In full-screen reading mode, page navigation keys scroll the active opportunity's details
      if (isDetailFullScreen) {
        const dialog = document.getElementById('fullscreen-job-dialog');
        const scrollContainer =
          dialog?.querySelector<HTMLElement>('[data-inspector-scroll-body]') ||
          dialog?.querySelector<HTMLElement>('.overflow-y-auto');

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
          scrollToIndex?.(nextIndex, { align: 'auto', behavior: 'smooth' });

          if (!isDetailFullScreen) {
            const nextEl = cardRefs?.current?.get(nextJob.id) ||
              document.querySelector<HTMLElement>(`[data-job-id="${nextJob.id}"]`);
            if (nextEl) {
              nextEl.focus({ preventScroll: true });
            } else if (
              target instanceof HTMLElement &&
              (target.dataset.jobCard === 'true' || isSidebarArrowNavigation)
            ) {
              target.blur();
            }
          } else {
            const dialog = document.getElementById('fullscreen-job-dialog');
            const scrollContainer =
              dialog?.querySelector<HTMLElement>('[data-inspector-scroll-body]') ||
              dialog?.querySelector<HTMLElement>('.overflow-y-auto');
            if (scrollContainer) {
              scrollContainer.scrollTop = 0;
              scrollContainer.focus({ preventScroll: true });
            }
          }
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = displayedJobs.findIndex((j) => j.id === selectedJob?.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : displayedJobs.length - 1;
        const prevJob = displayedJobs[prevIndex];
        if (prevJob) {
          onSelectJob(prevJob);
          updateUrlParam('job', String(prevJob.id));
          scrollToIndex?.(prevIndex, { align: 'auto', behavior: 'smooth' });

          if (!isDetailFullScreen) {
            const prevEl = cardRefs?.current?.get(prevJob.id) ||
              document.querySelector<HTMLElement>(`[data-job-id="${prevJob.id}"]`);
            if (prevEl) {
              prevEl.focus({ preventScroll: true });
            } else if (
              target instanceof HTMLElement &&
              (target.dataset.jobCard === 'true' || isSidebarArrowNavigation)
            ) {
              target.blur();
            }
          } else {
            const dialog = document.getElementById('fullscreen-job-dialog');
            const scrollContainer =
              dialog?.querySelector<HTMLElement>('[data-inspector-scroll-body]') ||
              dialog?.querySelector<HTMLElement>('.overflow-y-auto');
            if (scrollContainer) {
              scrollContainer.scrollTop = 0;
              scrollContainer.focus({ preventScroll: true });
            }
          }
        }
      } else if (e.key === 'Enter' && selectedJob) {
        if (target?.closest('button, a, [role="button"]')) {
          return;
        }
        const safeUrl = toSafeHttpUrl(selectedJob.url);
        if (safeUrl) {
          window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (e.key === 'ArrowRight' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        const currentIndex = STATUS_LIST.indexOf(selectedJob.status);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % STATUS_LIST.length : 0;
        void onUpdateStatus(selectedJob, STATUS_LIST[nextIndex]);
      } else if (e.key === 'ArrowLeft' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        const currentIndex = STATUS_LIST.indexOf(selectedJob.status);
        const prevIndex = currentIndex >= 0 ? (currentIndex - 1 + STATUS_LIST.length) % STATUS_LIST.length : STATUS_LIST.length - 1;
        void onUpdateStatus(selectedJob, STATUS_LIST[prevIndex]);
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
    []
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
