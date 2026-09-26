import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import type { Job } from '../../types/job';
import { StatusPill } from './StatusPill';
import { useTranslation } from 'react-i18next';
import { useJobsPageQuery } from '../../hooks/useQueries';

interface CommandMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobs?: Job[];
  onSelectJob: (job: Job) => void;
  userEmail?: string | null;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onOpenChange,
  jobs = [],
  onSelectJob,
  userEmail,
}) => {
  const { t } = useTranslation();
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

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
      label={t('command.label')}
    >
      <div className="flex items-center gap-2 border-b border-ds-border px-4 transition-colors focus-within:border-ds-accent">
        <Search className="size-4 shrink-0 text-ds-text-muted" />
        <Command.Input
          className="ds-control-focus"
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

        {commandJobs.map((job) => (
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
