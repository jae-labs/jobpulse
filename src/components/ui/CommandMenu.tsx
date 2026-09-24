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
import { useJobsPageQuery } from '../../hooks/useQueries';
import { toSafeHttpUrl } from '../../lib/utils';

interface CommandMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobs?: Job[];
  selectedJob?: Job | null;
  onSelectJob: (job: Job) => void;
  onUpdateStatus?: (job: Job, status: JobStatus) => Promise<void>;
  onSelectTab?: (tab: DashboardTab) => void;
  onFilterStatus?: (status: 'all' | JobStatus) => void;
  onSync?: () => void;
  onToggleTheme?: () => void;
  userEmail?: string | null;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onOpenChange,
  jobs = [],
  selectedJob,
  onSelectJob,
  onUpdateStatus,
  onSelectTab,
  onFilterStatus,
  onSync,
  onToggleTheme,
  userEmail,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  const { data: searchResults } = useJobsPageQuery(
    userEmail,
    { search: debouncedSearchQuery, limit: 25 },
    isOpen && Boolean(userEmail),
  );
  const commandJobs = searchResults?.items ?? jobs;

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
      <div className="flex items-center border-b border-ds-border/80 px-3">
        <Search className="size-4 shrink-0 text-ds-text-muted" />
        <Command.Input
          placeholder={t('command.placeholder')}
          autoFocus
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <kbd className="hidden sm:inline-block rounded border border-ds-border bg-ds-control px-1.5 py-0.5 text-[10px] font-mono text-ds-text-muted">
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
              <CheckCircle2 className="size-4 text-ds-status-applied" />
              <span>{t('command.markApplied')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'interested');
                onOpenChange(false);
              }}
            >
              <Sparkles className="size-4 text-ds-status-interested" />
              <span>{t('command.markInterested')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'interviewing');
                onOpenChange(false);
              }}
            >
              <Sparkles className="size-4 text-ds-status-interviewing" />
              <span>{t('command.markInterviewing')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                void onUpdateStatus?.(selectedJob, 'not_interested');
                onOpenChange(false);
              }}
            >
              <Briefcase className="size-4 text-ds-text-muted" />
              <span>{t('command.markNotInterested')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                const safeUrl = toSafeHttpUrl(selectedJob.url);
                if (safeUrl) {
                  window.open(safeUrl, '_blank', 'noopener,noreferrer');
                  onOpenChange(false);
                }
              }}
            >
              <ExternalLink className="size-4 text-ds-text-muted" />
              <span>{t('command.openApplication')}</span>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                const safeUrl = toSafeHttpUrl(selectedJob.url);
                if (safeUrl) {
                  handleCopyUrl(safeUrl);
                }
              }}
            >
              {copied ? (
                <Check className="size-4 text-ds-positive" />
              ) : (
                <Copy className="size-4 text-ds-text-muted" />
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
            <Briefcase className="size-4 text-ds-text-muted" />
            <span>{t('command.goToOpportunities')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('overview');
              onOpenChange(false);
            }}
          >
            <LayoutDashboard className="size-4 text-ds-text-muted" />
            <span>{t('command.goToOverview')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('sources');
              onOpenChange(false);
            }}
          >
            <Radio className="size-4 text-ds-text-muted" />
            <span>{t('command.goToSources')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('profile');
              onOpenChange(false);
            }}
          >
            <User className="size-4 text-ds-text-muted" />
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
            <span className="size-2 rounded-full bg-ds-status-applied mr-1" />
            <span>{t('command.filterApplied')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('interested');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-ds-status-interested mr-1" />
            <span>{t('command.filterInterested')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('interviewing');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-ds-status-interviewing mr-1" />
            <span>{t('command.filterInterviewing')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('new');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-ds-status-new mr-1" />
            <span>{t('command.filterNew')}</span>
          </Command.Item>

          <Command.Item
            onSelect={() => {
              onSelectTab?.('jobs');
              onFilterStatus?.('all');
              onOpenChange(false);
            }}
          >
            <span className="size-2 rounded-full bg-ds-text-muted mr-1" />
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
              <RefreshCw className="size-4 text-ds-text-muted" />
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
              <Sun className="size-4 text-ds-text-muted" />
              <span>{t('command.toggleTheme')}</span>
            </Command.Item>
          )}
        </Command.Group>

        {/* Search Job Titles directly */}
        <Command.Group heading={t('command.matchingPositions')}>
          {commandJobs.map((job) => (
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
                  <span className="font-medium text-ds-text-primary truncate max-w-xs sm:max-w-md">
                    {job.title}
                  </span>
                  <span className="text-xs text-ds-text-muted truncate max-w-[140px]">
                    {job.company || t('command.publicSector')}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-mono text-xs text-ds-text-muted">{job.relevance}%</span>
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
