import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import {
  Search,
  Briefcase,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  LayoutDashboard,
  Radio,
  User,
  Sun,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import type { Job, JobStatus } from '../../types/job';
import type { DashboardTab } from '../dashboard/navigation';
import { StatusPill } from './StatusPill';
import { useTranslation } from 'react-i18next';

interface CommandMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: Job[];
  selectedJob?: Job | null;
  onSelectJob: (job: Job) => void;
  onUpdateStatus?: (job: Job, status: JobStatus) => Promise<void>;
  activeTab?: DashboardTab;
  onSelectTab?: (tab: DashboardTab) => void;
  onFilterStatus?: (status: 'all' | JobStatus) => void;
  onSync?: () => void;
  onToggleTheme?: () => void;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onOpenChange,
  jobs,
  selectedJob,
  onSelectJob,
  onUpdateStatus,
  onSelectTab,
  onFilterStatus,
  onSync,
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // Global shortcut: ⌘K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA')) {
        e.preventDefault();
        onOpenChange(!isOpen);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;

  const handleCopyUrl = async (url: string) => {
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      setTimeout(() => onOpenChange(false), 600);
    } catch {
      // Clipboard access is only available in secure, permitted browser contexts.
    }
  };

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
      label={t('command.label')}
    >
      <div className="flex items-center border-b border-zinc-800/80 px-3">
        <Search className="size-4 shrink-0 text-zinc-500" />
        <Command.Input
          placeholder={t('command.placeholder')}
          autoFocus
        />
        <kbd className="hidden sm:inline-block rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
          ESC
        </kbd>
      </div>

      <Command.List>
        <Command.Empty>{t('command.noResults')}</Command.Empty>

        {/* Selected Job Quick Actions */}
        {selectedJob && (
          <Command.Group heading={t('command.activeJob', { title: selectedJob.title.slice(0, 30) })}>
            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'applied');
                onOpenChange(false);
              }}
            >
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span>{t('command.markApplied')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'interested');
                onOpenChange(false);
              }}
            >
              <Sparkles className="size-4 text-sky-400" />
              <span>{t('command.markInterested')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'interviewing');
                onOpenChange(false);
              }}
            >
              <Sparkles className="size-4 text-purple-400" />
              <span>{t('command.markInterviewing')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'not_interested');
                onOpenChange(false);
              }}
            >
              <Briefcase className="size-4 text-zinc-500" />
              <span>{t('command.markNotInterested')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                if (selectedJob.url) {
                  window.open(selectedJob.url, '_blank', 'noopener,noreferrer');
                  onOpenChange(false);
                }
              }}
            >
              <ExternalLink className="size-4 text-zinc-400" />
              <span>{t('command.openApplication')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                if (selectedJob.url) {
                  handleCopyUrl(selectedJob.url);
                }
              }}
            >
              {copied ? (
                <Check className="size-4 text-emerald-400" />
              ) : (
                <Copy className="size-4 text-zinc-400" />
              )}
              <span>{copied ? t('command.linkCopied') : t('command.copyApplicationLink')}</span>
            </Command.Item>
          </Command.Group>
        )}

        {/* Navigation */}
        <Command.Group heading={t('command.navigation')}>
          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onOpenChange(false);
            }}
          >
            <Briefcase className="size-4 text-zinc-400" />
            <span>{t('command.goToOpportunities')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('overview');
              onOpenChange(false);
            }}
          >
            <LayoutDashboard className="size-4 text-zinc-400" />
            <span>{t('command.goToOverview')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('sources');
              onOpenChange(false);
            }}
          >
            <Radio className="size-4 text-zinc-400" />
            <span>{t('command.goToSources')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('profile');
              onOpenChange(false);
            }}
          >
            <User className="size-4 text-zinc-400" />
            <span>{t('command.goToProfile')}</span>
          </Command.Item>
        </Command.Group>

        {/* Quick Filter Switchers */}
        <Command.Group heading={t('command.filters')}>
          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('applied');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-emerald-400 mr-1" />
            <span>{t('command.filterApplied')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('interested');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-sky-400 mr-1" />
            <span>{t('command.filterInterested')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('interviewing');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-purple-400 mr-1" />
            <span>{t('command.filterInterviewing')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('new');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-zinc-400 mr-1" />
            <span>{t('command.filterNew')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('all');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-zinc-400 mr-1" />
            <span>{t('command.filterAll')}</span>
          </Command.Item>
        </Command.Group>

        {/* System & Tools */}
        <Command.Group heading={t('command.preferences')}>
          {onSync && (
            <Command.Item
              onSelect={() => {
                onSync();
                onOpenChange(false);
              }}
            >
              <RefreshCw className="size-4 text-zinc-400" />
              <span>{t('command.sync')}</span>
            </Command.Item>
          )}

          {onToggleTheme && (
            <Command.Item
              onSelect={() => {
                onToggleTheme();
                onOpenChange(false);
              }}
            >
              <Sun className="size-4 text-zinc-400" />
              <span>{t('command.toggleTheme')}</span>
            </Command.Item>
          )}
        </Command.Group>

        {/* Search Job Titles directly */}
        <Command.Group heading={t('command.matchingPositions')}>
          {jobs.slice(0, 25).map((job) => (
            <Command.Item
              key={job.id}
              value={`${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`}
              onSelect={() => {
                onSelectTab?.('jobs');
                onSelectJob(job);
                onOpenChange(false);
              }}
            >
              <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-zinc-100 truncate max-w-xs sm:max-w-md">
                    {job.title}
                  </span>
                  <span className="text-xs text-zinc-500 truncate max-w-[140px]">
                    {job.company || t('command.publicSector')}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-mono text-xs text-zinc-400">{job.relevance}%</span>
                  <StatusPill status={job.status} showDot={false} />
                </div>
              </div>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
};
