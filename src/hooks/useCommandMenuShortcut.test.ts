import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommandMenuShortcut } from './useCommandMenuShortcut';

describe('useCommandMenuShortcut', () => {
  it('toggles on Cmd+K and Ctrl+K', () => {
    const toggle = vi.fn();
    renderHook(() => useCommandMenuShortcut(toggle));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true }));
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('ignores plain K and Alt combinations', () => {
    const toggle = vi.fn();
    renderHook(() => useCommandMenuShortcut(toggle));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, altKey: true }));
    expect(toggle).not.toHaveBeenCalled();
  });
});
