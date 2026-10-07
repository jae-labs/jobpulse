import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dashboardNavigation, getNavLabel, type DashboardTab } from './navigation';
import { DashboardBrand } from './DashboardBrand';
import { Button, Tooltip } from '@jae-labs/ui';

interface DashboardSidebarProps {
  activeTab: DashboardTab;
}

const DashboardSidebarComponent: React.FC<DashboardSidebarProps> = ({
  activeTab,
}) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const handleToggle = () => {
    setIsCollapsed((prev) => !prev);
  };

  // Profile is reached through account settings in the header avatar.
  const navItems = dashboardNavigation.filter((item) => item.id !== 'profile' && item.id !== 'privacy' && item.id !== 'members');

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 bg-ds-canvas p-2.5 ds-motion-control h-full select-none ${
        isCollapsed ? 'w-14 items-center' : 'w-56'
      }`}
    >
      <div className={`h-11 flex items-center shrink-0 mb-1 ${isCollapsed ? 'justify-center w-full' : 'px-1.5'}`}>
        <DashboardBrand isCollapsed={isCollapsed} />
      </div>

      <div className="w-full flex-1 pt-1">
        <nav className="space-y-0.5" aria-label={t('nav.dashboardNavigation')} data-dashboard-navigation>
          {navItems.map(({ id, label, icon: Icon, path }, index) => {
            const isActive = activeTab === id;
            const displayLabel = getNavLabel(t, id, label);
            const shortcutKey = String(index + 1);

            return (
              <Tooltip key={id} label={t('nav.goTo', { page: displayLabel })} shortcut={shortcutKey} side="right" className="w-full">
              <Link
                to={path}
                aria-label={displayLabel}
                aria-keyshortcuts={shortcutKey}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => {
                  if (event.detail > 0) event.currentTarget.blur();
                }}
                className={`group flex items-center rounded-ds-control text-xs font-medium ds-motion-control cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent/50 ${
                  isCollapsed
                    ? 'size-9 justify-center mx-auto'
                    : 'w-full justify-between px-2 py-1.5 text-left'
                } ${
                  isActive
                    ? 'bg-ds-selected text-ds-text-primary border border-transparent'
                    : 'text-ds-text-muted hover:bg-ds-hover hover:text-ds-text-secondary border border-transparent'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                  <Icon className={`size-3.5 ${isActive ? 'text-ds-text-primary' : 'text-ds-text-muted'}`} />
                  {!isCollapsed && <span>{displayLabel}</span>}
                </div>
              </Link>
              </Tooltip>
            );
          })}
        </nav>
      </div>

      <div className={`pt-2 border-t border-ds-border w-full flex ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={handleToggle}
          className="size-8"
          title={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          aria-label={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <PanelLeftClose className="size-3.5" />
          )}
        </Button>
      </div>
    </aside>
  );
};

export const DashboardSidebar = React.memo(DashboardSidebarComponent);
