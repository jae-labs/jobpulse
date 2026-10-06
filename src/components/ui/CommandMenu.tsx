import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import type { Job } from '../../types/job';
import { Button } from '@jae-labs/ui';
import { StatusPill } from './StatusPill';
import { useTranslation } from 'react-i18next';
import { useJobsPageQuery } from '../../hooks/useQueries';

interface CommandMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectJob: (job: Job) => void;
  onNavigateToPrivacy?: () => void;
  userId?: string | null;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onOpenChange,
  onSelectJob,
  onNavigateToPrivacy,
  userId,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  const { data: searchResults, isPending, isError, refetch, isFetching } = useJobsPageQuery(
    userId,
    { search: debouncedSearchQuery, limit: 25 },
    isOpen && Boolean(userId),
  );
  const commandJobs = userId ? (searchResults?.items ?? []) : [];
  const showPrivacy = Boolean(onNavigateToPrivacy) && t('privacy.notice').toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase());
  const searching = Boolean(userId) && (isPending || searchQuery !== debouncedSearchQuery || isFetching);

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

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
      label={t('command.label')}
      shouldFilter={false}
    >
      <div className="flex items-center gap-2 border-b border-ds-border px-4 ds-motion-control focus-within:border-ds-accent">
        <Search className="size-4 shrink-0 text-ds-text-muted" />
        <Command.Input
          className="ds-control-focus"
          placeholder={t('command.placeholder')}
          autoFocus
          value={searchQuery}
          onValueChange={value => setSearchQuery(value.slice(0, 80))}
          maxLength={80}
        />
        <kbd className="hidden sm:inline-block rounded-ds-control border border-ds-border bg-ds-control px-1.5 py-0.5 text-xs font-mono text-ds-text-muted">
          ESC
        </kbd>
      </div>

      <Command.List>
        {showPrivacy && <Command.Item value="data-and-privacy" onSelect={() => {
          onNavigateToPrivacy?.();
          onOpenChange(false);
        }}>{t('privacy.notice')}</Command.Item>}
        {isError ? <div role="alert" className="p-4 space-y-2"><p className="text-xs text-ds-negative">{t('common.loadError')}</p><Button size="sm" variant="secondary" onClick={() => void refetch()}>{t('common.retry')}</Button></div>
          : searching ? <div role="status" className="p-4">{t('common.loading')}</div>
          : commandJobs.length === 0 && !showPrivacy ? <div role="status" className="p-4">{t('command.noResults')}</div> : null}

        {(!isError && !searching ? commandJobs : []).map((job) => (
          <Command.Item
            key={job.id}
            value={`${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`}
            onSelect={() => {
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
      </Command.List>
    </Command.Dialog>
  );
};
