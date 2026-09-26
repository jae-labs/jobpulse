import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceArrowScroll } from './useWorkspaceArrowScroll';

describe('useWorkspaceArrowScroll', () => {
  it.each(['overview', 'sources', 'profile'] as const)('scrolls the %s workspace after navigation', (tab) => {
    const workspace = document.createElement('main');
    const scrollBy = vi.fn();
    workspace.scrollBy = scrollBy;
    const workspaceRef = { current: workspace };
    const nav = document.createElement('nav');
    nav.setAttribute('data-dashboard-navigation', '');
    const link = document.createElement('a');
    nav.appendChild(link);
    document.body.append(nav, workspace);

    const { unmount } = renderHook(() => useWorkspaceArrowScroll(tab, workspaceRef, false));
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(scrollBy).toHaveBeenNthCalledWith(1, { top: 96 });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { top: -96 });

    unmount();
    nav.remove();
    workspace.remove();
  });

  it('scrolls Profile when focus remains on the account settings trigger', () => {
    const workspace = document.createElement('main');
    const scrollBy = vi.fn();
    workspace.scrollBy = scrollBy;
    const trigger = document.createElement('button');
    trigger.setAttribute('data-account-settings-trigger', '');
    document.body.append(trigger, workspace);

    const { unmount } = renderHook(() =>
      useWorkspaceArrowScroll('profile', { current: workspace }, false)
    );
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(scrollBy).toHaveBeenCalledWith({ top: 96 });

    unmount();
    trigger.remove();
    workspace.remove();
  });

  it('leaves interactive controls and the opportunities workspace alone', () => {
    const workspace = document.createElement('main');
    const scrollBy = vi.fn();
    workspace.scrollBy = scrollBy;
    const workspaceRef = { current: workspace };
    const button = document.createElement('button');
    document.body.append(button, workspace);

    const { rerender, unmount } = renderHook(
      ({ tab }) => useWorkspaceArrowScroll(tab, workspaceRef, false),
      { initialProps: { tab: 'overview' as 'overview' | 'jobs' } }
    );
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(scrollBy).not.toHaveBeenCalled();

    rerender({ tab: 'jobs' });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(scrollBy).not.toHaveBeenCalled();

    unmount();
    button.remove();
    workspace.remove();
  });
});
