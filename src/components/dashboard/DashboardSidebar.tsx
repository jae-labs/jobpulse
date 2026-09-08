import React from 'react';
import { LogOut } from 'lucide-react';
import { dashboardNavigation, type DashboardTab } from './navigation';
import type { Profile } from '../../types/job';
import { BrandLogo } from '../ui/BrandLogo';

interface DashboardSidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  profile: Profile | null;
  jobCount: number;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab,
  onSelectTab,
  jobCount,
  userEmail,
  onSignOut,
}) => {
  return (
    <aside className="surface-panel hidden h-[calc(100dvh-2rem)] w-60 shrink-0 flex-col rounded-2xl p-3.5 lg:sticky lg:top-4 lg:flex border-zinc-800/80 bg-zinc-950">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <BrandLogo size="md" />
        <h1 className="text-sm font-semibold tracking-tight text-zinc-100">JobPulse</h1>
      </div>

      {/* Navigation Section */}
      <div className="mt-6">
        <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-mono">
          Workspace
        </p>
        <nav className="mt-2 space-y-1" aria-label="Dashboard navigation">
          {dashboardNavigation.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            let badge = '';
            if (id === 'jobs' && jobCount > 0) badge = String(jobCount);

            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-xs'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`size-3.5 ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} />
                  <span>{label}</span>
                </div>
                {badge && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-zinc-700 text-zinc-200'
                        : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User & Sign Out Footer */}
      {userEmail && (
        <div className="mt-auto pt-4 border-t border-zinc-900 space-y-2">
          <div className="flex items-center justify-between px-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Logged in
              </span>
              <span className="block truncate text-xs font-medium text-zinc-300" title={userEmail}>
                {userEmail}
              </span>
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 transition-colors cursor-pointer ml-2"
                title="Sign out of JobPulse"
                aria-label="Sign out"
              >
                <LogOut className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
