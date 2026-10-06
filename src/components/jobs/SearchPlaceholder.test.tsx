import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPlaceholder } from './SearchPlaceholder';

describe('SearchPlaceholder', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('types and deletes one character at a time before cycling to the next word', () => {
    vi.useFakeTimers();
    const view = render(<SearchPlaceholder />);
    const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    expect(screen.getByText('Search by')).toHaveAttribute('class', 'truncate');
    advance(300);
    expect(screen.getByText('Search by t')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) advance(85);
    expect(screen.getByText('Search by title')).toBeInTheDocument();
    advance(1400);
    advance(45);
    expect(screen.getByText('Search by titl')).toBeInTheDocument();
    for (let i = 0; i < 5; i++) advance(45);
    advance(300);
    expect(screen.getByText('Search by c')).toBeInTheDocument();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses a static hint without timers or a blinking cursor for reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<SearchPlaceholder />);
    expect(screen.getByText('Search by title, company, skills, or location...')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.job-search-caret')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
