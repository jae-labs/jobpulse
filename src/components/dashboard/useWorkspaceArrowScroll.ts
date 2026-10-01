import { useEffect, type RefObject } from 'react';
import type { DashboardTab } from './navigation';

export function useWorkspaceArrowScroll(
  activeTab: DashboardTab,
  workspaceRef: RefObject<HTMLElement | null>,
  isCommandMenuOpen: boolean
) {
  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'sources' && activeTab !== 'profile') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') ||
        event.defaultPrevented ||
        event.metaKey || event.ctrlKey || event.altKey ||
        isCommandMenuOpen ||
        document.querySelector('[role="dialog"]')
      ) return;

      const target = event.target instanceof Element ? event.target : null;
      const isPageFocus = target === document.body || target === document.documentElement;
      const isSidebarLink = Boolean(target?.closest('[data-dashboard-navigation] a'));
      const isProfileMenuTrigger = activeTab === 'profile' &&
        Boolean(target?.closest('[data-account-settings-trigger]'));
      if (!isPageFocus && !isSidebarLink && !isProfileMenuTrigger) return;

      const workspace = workspaceRef.current;
      if (!workspace) return;
      event.preventDefault();
      workspace.scrollBy({ top: event.key === 'ArrowDown' ? 96 : -96 });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, workspaceRef, isCommandMenuOpen]);
}
