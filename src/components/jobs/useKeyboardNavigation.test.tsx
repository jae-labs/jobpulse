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
  it('preserves Space activation on native controls in full-screen reading mode', () => {
    renderHook(() => useKeyboardNavigation({ displayedJobs: mockJobs, selectedJob: mockJobs[0],
      onSelectJob: vi.fn(), onUpdateStatus: vi.fn(), isDetailFullScreen: true,
      setIsDetailFullScreen: vi.fn(), layoutMode: 'list', setLayoutMode: vi.fn(),
      updateUrlParam: vi.fn(), scrollToIndex: vi.fn() }));
    const button = document.createElement('button');
    document.body.appendChild(button);
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    button.remove();
  });
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
        layoutMode: 'split', setLayoutMode: vi.fn(),
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

  it('transfers DOM focus to next card and blurs previous card when navigating with ArrowDown', () => {
    const card1 = document.createElement('button');
    card1.setAttribute('data-job-card', 'true');
    const card2 = document.createElement('button');
    card2.setAttribute('data-job-card', 'true');
    document.body.appendChild(card1);
    document.body.appendChild(card2);

    const cardMap = new Map<number, HTMLElement>([
      [mockJobs[0].id, card1],
      [mockJobs[1].id, card2],
    ]);
    const cardRefs = { current: cardMap };

    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split', setLayoutMode: vi.fn(),
        updateUrlParam,
        scrollToIndex,
        cardRefs,
      })
    );

    card1.focus();
    expect(document.activeElement).toBe(card1);

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    card1.dispatchEvent(event);

    expect(onSelectJob).toHaveBeenCalledWith(mockJobs[1]);
    expect(document.activeElement).toBe(card2);
    expect(card1).not.toBe(document.activeElement);

    document.body.removeChild(card1);
    document.body.removeChild(card2);
  });

  it('uses opportunity arrows after a sidebar link has keyboard focus', () => {
    const nav = document.createElement('nav');
    nav.setAttribute('data-dashboard-navigation', '');
    const link = document.createElement('a');
    link.href = '/opportunities';
    nav.appendChild(link);
    const card1 = document.createElement('button');
    const card2 = document.createElement('button');
    document.body.append(nav, card1, card2);
    const cardRefs = {
      current: new Map<number, HTMLElement>([
        [mockJobs[0].id, card1],
        [mockJobs[1].id, card2],
      ]),
    };

    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split', setLayoutMode: vi.fn(),
        updateUrlParam,
        cardRefs,
      })
    );

    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(onSelectJob).toHaveBeenCalledWith(mockJobs[1]);
    expect(document.activeElement).toBe(card2);

    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(onSelectJob).toHaveBeenLastCalledWith(mockJobs[1]);
    expect(document.activeElement).toBe(card2);

    nav.remove();
    card1.remove();
    card2.remove();
  });

  it('cycles job status when focused on job card and pressing ArrowRight or ArrowLeft', () => {
    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: false,
        setIsDetailFullScreen,
        layoutMode: 'split', setLayoutMode: vi.fn(),
        updateUrlParam,
        scrollToIndex,
      })
    );

    const cardButton = document.createElement('button');
    cardButton.setAttribute('data-job-card', 'true');
    document.body.appendChild(cardButton);
    cardButton.focus();

    // ArrowRight advances from 'new' to 'applied'
    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    cardButton.dispatchEvent(rightEvent);
    expect(onUpdateStatus).toHaveBeenCalledWith(mockJobs[0], 'applied');

    // ArrowLeft wraps from 'new' backwards to 'rejected'
    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    cardButton.dispatchEvent(leftEvent);
    expect(onUpdateStatus).toHaveBeenCalledWith(mockJobs[0], 'rejected');

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
        layoutMode: 'split', setLayoutMode: vi.fn(),
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
        layoutMode: 'split', setLayoutMode: vi.fn(),
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

  it('navigates to next job with ArrowDown when in full-screen reading mode', () => {
    const dialog = document.createElement('div');
    dialog.id = 'fullscreen-job-dialog';
    const scrollBody = document.createElement('div');
    scrollBody.setAttribute('data-inspector-scroll-body', '');
    dialog.appendChild(scrollBody);
    document.body.appendChild(dialog);

    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[0],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: true,
        setIsDetailFullScreen,
        layoutMode: 'split', setLayoutMode: vi.fn(),
        updateUrlParam,
        scrollToIndex,
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    window.dispatchEvent(event);

    expect(onSelectJob).toHaveBeenCalledWith(mockJobs[1]);
    expect(updateUrlParam).toHaveBeenCalledWith('job', '2');
    document.body.removeChild(dialog);
  });

  it('navigates to previous job with ArrowUp when in full-screen reading mode', () => {
    const dialog = document.createElement('div');
    dialog.id = 'fullscreen-job-dialog';
    const scrollBody = document.createElement('div');
    scrollBody.setAttribute('data-inspector-scroll-body', '');
    dialog.appendChild(scrollBody);
    document.body.appendChild(dialog);

    renderHook(() =>
      useKeyboardNavigation({
        displayedJobs: mockJobs,
        selectedJob: mockJobs[1],
        onSelectJob,
        onUpdateStatus,
        isDetailFullScreen: true,
        setIsDetailFullScreen,
        layoutMode: 'split', setLayoutMode: vi.fn(),
        updateUrlParam,
        scrollToIndex,
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
    window.dispatchEvent(event);

    expect(onSelectJob).toHaveBeenCalledWith(mockJobs[0]);
    expect(updateUrlParam).toHaveBeenCalledWith('job', '1');
    document.body.removeChild(dialog);
  });

  describe('Enter key shortcut (apply)', () => {
    let windowOpenSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('opens application URL when Enter is pressed on a focused job card', () => {
      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: false,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      const cardButton = document.createElement('button');
      cardButton.setAttribute('data-job-card', 'true');
      cardButton.setAttribute('data-job-id', '1');
      document.body.appendChild(cardButton);
      cardButton.focus();

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      cardButton.dispatchEvent(event);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/1', '_blank', 'noopener,noreferrer');
      expect(event.defaultPrevented).toBe(true);

      document.body.removeChild(cardButton);
    });

    it('opens application URL for the second item after navigating down with ArrowDown and pressing Enter', () => {
      const card1 = document.createElement('button');
      card1.setAttribute('data-job-card', 'true');
      card1.setAttribute('data-job-id', '1');
      const card2 = document.createElement('button');
      card2.setAttribute('data-job-card', 'true');
      card2.setAttribute('data-job-id', '2');
      document.body.appendChild(card1);
      document.body.appendChild(card2);

      const cardRefs = {
        current: new Map<number, HTMLElement>([
          [mockJobs[0].id, card1],
          [mockJobs[1].id, card2],
        ]),
      };

      const { rerender } = renderHook(
        (props: { selected: Job }) =>
          useKeyboardNavigation({
            displayedJobs: mockJobs,
            selectedJob: props.selected,
            onSelectJob,
            onUpdateStatus,
            isDetailFullScreen: false,
            setIsDetailFullScreen,
            layoutMode: 'split', setLayoutMode: vi.fn(),
            updateUrlParam,
            scrollToIndex,
            cardRefs,
          }),
        { initialProps: { selected: mockJobs[0] } }
      );

      // Move down from first item to second item
      card1.focus();
      const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
      card1.dispatchEvent(downEvent);

      expect(onSelectJob).toHaveBeenCalledWith(mockJobs[1]);
      expect(document.activeElement).toBe(card2);

      rerender({ selected: mockJobs[1] });

      // Press Enter while focused on the second item's card
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      card2.dispatchEvent(enterEvent);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/2', '_blank', 'noopener,noreferrer');
      expect(enterEvent.defaultPrevented).toBe(true);

      document.body.removeChild(card1);
      document.body.removeChild(card2);
    });

    it('opens application URL when Enter is pressed with no element focused (initial page load)', () => {
      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: false,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      window.dispatchEvent(event);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/1', '_blank', 'noopener,noreferrer');
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not open URL when Enter is pressed on a non-card button', () => {
      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: false,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      const regularButton = document.createElement('button');
      document.body.appendChild(regularButton);
      regularButton.focus();

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      regularButton.dispatchEvent(event);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);

      document.body.removeChild(regularButton);
    });

    it('does not open URL when Enter is pressed on an anchor link', () => {
      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: false,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      const link = document.createElement('a');
      link.href = '#';
      document.body.appendChild(link);
      link.focus();

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      link.dispatchEvent(event);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);

      document.body.removeChild(link);
    });

    it('does not open URL when Enter is pressed inside an input', () => {
      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: false,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input.dispatchEvent(event);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);

      document.body.removeChild(input);
    });

    it('opens application URL when Enter is pressed in full-screen reading mode on the scroll container', () => {
      const dialog = document.createElement('div');
      dialog.id = 'fullscreen-job-dialog';
      const scrollBody = document.createElement('div');
      scrollBody.setAttribute('data-inspector-scroll-body', '');
      scrollBody.tabIndex = 0;
      dialog.appendChild(scrollBody);
      document.body.appendChild(dialog);

      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: true,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      scrollBody.focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      scrollBody.dispatchEvent(event);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/1', '_blank', 'noopener,noreferrer');
      expect(event.defaultPrevented).toBe(true);

      document.body.removeChild(dialog);
    });

    it('does not open application URL when Enter is pressed in full-screen reading mode on a dialog button', () => {
      const dialog = document.createElement('div');
      dialog.id = 'fullscreen-job-dialog';
      const closeBtn = document.createElement('button');
      closeBtn.setAttribute('aria-label', 'Close');
      dialog.appendChild(closeBtn);
      document.body.appendChild(dialog);

      renderHook(() =>
        useKeyboardNavigation({
          displayedJobs: mockJobs,
          selectedJob: mockJobs[0],
          onSelectJob,
          onUpdateStatus,
          isDetailFullScreen: true,
          setIsDetailFullScreen,
          layoutMode: 'split', setLayoutMode: vi.fn(),
          updateUrlParam,
          scrollToIndex,
        })
      );

      closeBtn.focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      closeBtn.dispatchEvent(event);

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);

      document.body.removeChild(dialog);
    });
  });
});
