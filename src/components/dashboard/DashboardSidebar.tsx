import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dashboardNavigation, getNavLabel, type DashboardTab } from './navigation';
import { ProjectSwitcher } from './ProjectSwitcher';

interface DashboardSidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  onOpenCommandMenu?: () => void;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab,
}) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const handleToggle = () => {
    setIsCollapsed((prev) => !prev);
  };

  // Profile is moved to top right header avatar, so exclude from sidebar
  const navItems = dashboardNavigation.filter((item) => item.id !== 'profile');

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 bg-black p-2.5 transition-all duration-200 ease-in-out h-full select-none ${
        isCollapsed ? 'w-14 items-center' : 'w-56'
      }`}
    >
      {/* Top Workspace / Project Header */}
      <div className={`h-11 flex items-center shrink-0 mb-1 ${isCollapsed ? 'justify-center w-full' : 'px-1.5'}`}>
        <ProjectSwitcher currentProject="JobPulse" isCollapsed={isCollapsed} />
      </div>

      {/* Navigation Section */}
      <div className="w-full flex-1 pt-1">
        <nav className="space-y-0.5" aria-label="Dashboard navigation">
          {navItems.map(({ id, label, icon: Icon, path }) => {
            const isActive = activeTab === id;
            const displayLabel = getNavLabel(t, id, label);

            return (
              <Link
                key={id}
                to={path}
                title={isCollapsed ? displayLabel : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 ${
                  isCollapsed
                    ? 'size-9 justify-center mx-auto'
                    : 'w-full justify-between px-2 py-1.5 text-left'
                } ${
                  isActive
                    ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-xs'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                  <Icon className={`size-3.5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                  {!isCollapsed && <span>{displayLabel}</span>}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Collapse / Expand Toggle Button at Bottom */}
      <div className={`pt-2 border-t border-white/[0.06] w-full flex ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
        <button
          type="button"
          onClick={handleToggle}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-200 border border-white/[0.08] bg-white/[0.02] transition-colors cursor-pointer"
          title={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          aria-label={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <PanelLeftClose className="size-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
};
