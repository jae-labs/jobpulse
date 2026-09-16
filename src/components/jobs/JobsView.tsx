import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Sparkles,
  MapPin,
  Layers,
  Banknote,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  SlidersHorizontal,
  RefreshCw,
  X,
  Columns2,
  Rows3,
} from 'lucide-react';
import type { Job, JobStatus, OverviewMetrics } from '../../types/job';
import { STATUS_LIST } from '../../types/job';
import { JobCard } from './JobCard';
import { JobDetailInspector } from './JobDetailInspector';
import { Button, Card, EmptyState, Pill, type PillVariant, TextField } from '../../design-system';
import { useSearchParams } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { useJobByIdQuery, useJobsInfiniteQuery } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';
import { toSafeHttpUrl } from '../../lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';

interface JobsViewProps {
  jobs?: Job[];
  overviewMetrics?: OverviewMetrics;
  selectedJob?: Job | null;
  onSelectJob: (job: Job | null) => void;
  onUpdateStatus?: (job: Job, status: JobStatus) => Promise<void>;
  isUpdating?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  initialStatusFilter?: 'all' | JobStatus;
  initialDomainFilter?: string;
  initialMinMatch?: number;
  onFilterReset?: () => void;
  onOpenCommandMenu?: () => void;
  userEmail?: string | null;
}

const parseSalaryMax = (salaryText: string | null | undefined): number | null => {
  if (!salaryText) return null;
  const matches = salaryText.match(/\d[\d,]*/g);
  if (!matches) return null;
  const nums = matches
    .map((m) => {
      let val = parseInt(m.replace(/,/g, ''), 10);
      if (val < 1000) val *= 1000;
      return val;
    })
    .filter((n) => !isNaN(n) && n >= 15000);
  if (nums.length === 0) return null;
  return Math.max(...nums);
};

const matchesSalaryFilter = (salaryText: string | null | undefined, filter: string): boolean => {
  if (filter === 'all') return true;
  if (filter === 'disclosed') return Boolean(salaryText && salaryText.trim());
  const maxSal = parseSalaryMax(salaryText);
  if (filter === '50k') return maxSal !== null && maxSal >= 50000;
  if (filter === '60k') return maxSal !== null && maxSal >= 60000;
  if (filter === '70k') return maxSal !== null && maxSal >= 70000;
  if (filter === '80k') return maxSal !== null && maxSal >= 80000;
  return true;
};

export type SortField = 'match' | 'location' | 'category' | 'salary';

const STATUS_FILTER_CONFIG: Record<
  JobStatus,
  {
    labelKey: string;
    variant: PillVariant;
  }
> = {
  new: { labelKey: 'status.new', variant: 'status-new' },
  applied: { labelKey: 'status.applied', variant: 'status-applied' },
  interviewing: { labelKey: 'status.interviewing', variant: 'status-interviewing' },
  interested: { labelKey: 'status.interested', variant: 'status-interested' },
  not_interested: { labelKey: 'status.not_interested', variant: 'status-muted' },
};

const REGIONAL_LOCATIONS = [
  { id: 'dublin', label: 'Dublin' },
  { id: 'cork', label: 'Cork' },
  { id: 'galway', label: 'Galway' },
  { id: 'kildare', label: 'Kildare' },
  { id: 'laois', label: 'Laois' },
  { id: 'kilkenny', label: 'Kilkenny' },
  { id: 'ireland', label: 'Ireland (National / Remote)' },
] as const;

export const JobsView: React.FC<JobsViewProps> = ({
  jobs = [],
  overviewMetrics,
  selectedJob,
  onSelectJob,
  onUpdateStatus,
  isUpdating = false,
  searchQuery: controlledSearch,
  onSearchChange: setControlledSearch,
  initialStatusFilter = 'all',
  initialDomainFilter = 'all',
  initialMinMatch = 0,
  onFilterReset,
  onOpenCommandMenu,
  userEmail,
}) => {
  // TanStack Virtual mutates a stable Virtualizer instance as scroll state
  // changes. React Compiler must not memoize this component around that API.
  "use no memo";
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation('translation');
  const [internalQuery, setInternalQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('match');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [layoutMode, setLayoutMode] = useState<'split' | 'list'>('split');
  const [isDetailFullScreen, setIsDetailFullScreen] = useState(false);

  // URL-driven query and filters with fallback to initial props
  const statusParam = searchParams.get('status') as JobStatus | null;
  const statusFilter: 'all' | JobStatus = statusParam || initialStatusFilter || 'all';

  const domainParam = searchParams.get('domain');
  const domainFilter = domainParam || initialDomainFilter || 'all';

  const matchParam = searchParams.get('match');
  const minMatch = matchParam !== null ? Number(matchParam) : initialMinMatch;

  const locationFilter = searchParams.get('location') || 'all';
  const salaryFilter = searchParams.get('salary') || 'all';
  const urlJobId = searchParams.get('job') ? Number(searchParams.get('job')) : null;
  const { data: linkedJob } = useJobByIdQuery(urlJobId, userEmail, Boolean(urlJobId));

  const query = controlledSearch !== undefined
    ? controlledSearch
    : (searchParams.get('q') ?? internalQuery);

  const updateUrlParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || value === 'all' || value === '0') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setStatusFilter = (status: 'all' | JobStatus) => {
    updateUrlParam('status', status === 'all' ? null : status);
  };
  const setDomainFilter = (domain: string) => {
    updateUrlParam('domain', domain === 'all' ? null : domain);
  };
  const setMinMatch = (match: number) => {
    updateUrlParam('match', match === 0 ? null : String(match));
  };
  const setLocationFilter = (loc: string) => {
    updateUrlParam('location', loc === 'all' ? null : loc);
  };
  const setSalaryFilter = (sal: string) => {
    updateUrlParam('salary', sal === 'all' ? null : sal);
  };

  useEffect(() => {
    if (!isDetailFullScreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isDetailFullScreen]);

  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const listContainerRef = useRef<HTMLDivElement>(null);

  const queryParams = useMemo(() => ({
    status: statusFilter,
    domain: domainFilter,
    minMatch,
    location: locationFilter,
    salary: salaryFilter,
    search: query,
    sortBy: sortField,
    sortDir,
  }), [statusFilter, domainFilter, minMatch, locationFilter, salaryFilter, query, sortField, sortDir]);

  const {
    data: pageQueryData,
    isLoading: isPageLoading,
    isError: isPageError,
    error: pageError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useJobsInfiniteQuery(userEmail, queryParams, Boolean(userEmail));

  const pageItems = useMemo(() =>
    pageQueryData?.pages.flatMap(p => p.items) ?? [],
    [pageQueryData]
  );
  const pageTotal = pageQueryData?.pages[0]?.total ?? 0;

  const handleQueryChange = (val: string) => {
    if (setControlledSearch) {
      setControlledSearch(val);
    } else {
      setInternalQuery(val);
      updateUrlParam('q', val || null);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir(field === 'salary' || field === 'match' ? 'desc' : 'asc');
    }
  };

  const statusCounts = useMemo(() => {
    if (overviewMetrics?.counts) {
      return {
        all: overviewMetrics.total,
        ...overviewMetrics.counts,
      };
    }
    const sourceJobs = jobs.length > 0 ? jobs : pageItems;
    const counts: Record<string, number> = { all: sourceJobs.length };
    for (const s of STATUS_LIST) {
      counts[s] = sourceJobs.filter((j) => j.status === s).length;
    }
    return counts;
  }, [jobs, overviewMetrics, pageItems]);

  // Jobs matching other active filters
  const baseFilteredJobs = useMemo(() => {
    const sourceJobs = jobs.length > 0 ? jobs : pageItems;
    return sourceJobs.filter((job) => {
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesMinMatch = job.relevance >= minMatch;
      const text = `${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`.toLowerCase();
      const matchesQuery = !query.trim() || text.includes(query.toLowerCase());

      const matchesSalary = matchesSalaryFilter(job.salary_text, salaryFilter);

      return matchesStatus && matchesMinMatch && matchesQuery && matchesSalary;
    });
  }, [jobs, pageItems, statusFilter, minMatch, query, salaryFilter]);

  const availableDomains = useMemo(() => {
    if (overviewMetrics?.categories && overviewMetrics.categories.length > 0) {
      return overviewMetrics.categories.map((c) => ({
        domain: c.name,
        count: c.value,
      }));
    }
    const counts = new Map<string, number>();
    for (const j of baseFilteredJobs) {
      const domain = (j.role_domain || 'General Administration').trim();
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([domain, count]) => ({ domain, count }));
  }, [baseFilteredJobs, overviewMetrics]);

  const activeDomainFilter = domainFilter;

  const availableLocations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of baseFilteredJobs) {
      const loc = (j.location || '').trim();
      if (loc) {
        counts.set(loc, (counts.get(loc) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([loc, count]) => ({ loc, count }));
  }, [baseFilteredJobs]);

  const activeLocationFilter = locationFilter;

  const hasActiveFilters = Boolean(
    query.trim() ||
    statusFilter !== 'all' ||
    minMatch > 0 ||
    activeLocationFilter !== 'all' ||
    activeDomainFilter !== 'all' ||
    salaryFilter !== 'all' ||
    sortField !== 'match' ||
    sortDir !== 'desc'
  );

  const handleResetFilters = () => {
    if (setControlledSearch) setControlledSearch('');
    else setInternalQuery('');
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ['q', 'status', 'match', 'location', 'domain', 'salary']) next.delete(key);
      return next;
    }, { replace: true });
    setSortField('match');
    setSortDir('desc');
    onFilterReset?.();
  };

  const filteredJobs = useMemo(() => {
    return baseFilteredJobs
      .filter((job) => {
        if (activeDomainFilter !== 'all' && (job.role_domain || 'General Administration') !== activeDomainFilter) {
          return false;
        }
        if (activeLocationFilter === 'all') return true;
        const locLower = (job.location || '').toLowerCase();
        return locLower.includes(activeLocationFilter.toLowerCase());
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'match') {
          cmp = b.relevance - a.relevance || b.id - a.id;
          return sortDir === 'desc' ? cmp : -cmp;
        }
        if (sortField === 'salary') {
          const salA = parseSalaryMax(a.salary_text) ?? (sortDir === 'desc' ? -1 : 99999999);
          const salB = parseSalaryMax(b.salary_text) ?? (sortDir === 'desc' ? -1 : 99999999);
          cmp = salB - salA || b.relevance - a.relevance;
          return sortDir === 'desc' ? cmp : -cmp;
        }
        if (sortField === 'location') {
          cmp = (a.location || '').localeCompare(b.location || '') || b.relevance - a.relevance;
          return sortDir === 'asc' ? cmp : -cmp;
        }
        if (sortField === 'category') {
          cmp = (a.role_domain || '').localeCompare(b.role_domain || '') || b.relevance - a.relevance;
          return sortDir === 'asc' ? cmp : -cmp;
        }
        return b.relevance - a.relevance;
      });
  }, [baseFilteredJobs, activeDomainFilter, activeLocationFilter, sortField, sortDir]);


  const displayedJobs = useMemo(() => {
    return pageQueryData ? pageItems : filteredJobs;
  }, [pageQueryData, pageItems, filteredJobs]);
  const totalMatchingCount = pageQueryData ? pageTotal : filteredJobs.length;
  const totalCatalogCount = overviewMetrics?.total ?? (jobs.length > 0 ? jobs.length : pageTotal);
  const virtualizer = useVirtualizer({
    count: displayedJobs.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 176,
    overscan: 6,
  });

  // Auto-select job from URL param or default to first in split mode
  useEffect(() => {
    if (urlJobId !== null) {
      const match = displayedJobs.find((j) => j.id === urlJobId) ?? linkedJob;
      if (match && match.id !== selectedJob?.id) {
        onSelectJob(match);
      }
      if (match && (layoutMode === 'list' || (typeof window !== 'undefined' && window.innerWidth < 1024))) {
        setIsDetailFullScreen(true);
      }
      return;
    }
    if (displayedJobs.length === 0) return;
    if (layoutMode === 'split' && !selectedJob && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      onSelectJob(displayedJobs[0]);
    }
  }, [urlJobId, layoutMode, selectedJob, displayedJobs, linkedJob, onSelectJob]);

  // Keyboard navigation: j/k to move up/down, Enter to apply, a/i/o/n to update status
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')) return;

      // In full-screen reading mode, arrow and page keys scroll the active opportunity's details
      if (isDetailFullScreen) {
        const dialog = document.getElementById('fullscreen-job-dialog');
        const scrollContainer =
          dialog?.querySelector<HTMLElement>('[data-inspector-scroll-body]') ||
          dialog?.querySelector<HTMLElement>('.overflow-y-auto');

        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: 80 });
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: -80 });
          return;
        }
        if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: 400 });
          return;
        }
        if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
          e.preventDefault();
          scrollContainer?.scrollBy({ top: -400 });
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          if (scrollContainer) scrollContainer.scrollTop = 0;
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
          return;
        }
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = displayedJobs.findIndex((j) => j.id === selectedJob?.id);
        const nextIndex = currentIndex < displayedJobs.length - 1 ? currentIndex + 1 : 0;
        const target = displayedJobs[nextIndex];
        if (target) {
          onSelectJob(target);
          updateUrlParam('job', String(target.id));
          // Scroll down past top header if user is starting from top of page
          if (window.scrollY < 70) {
            window.scrollTo({ top: 80, behavior: 'smooth' });
          }
          virtualizer.scrollToIndex(nextIndex, { align: 'auto', behavior: 'smooth' });
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = displayedJobs.findIndex((j) => j.id === selectedJob?.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : displayedJobs.length - 1;
        const target = displayedJobs[prevIndex];
        if (target) {
          onSelectJob(target);
          updateUrlParam('job', String(target.id));
          if (window.scrollY < 70) {
            window.scrollTo({ top: 80, behavior: 'smooth' });
          }
          virtualizer.scrollToIndex(prevIndex, { align: 'auto', behavior: 'smooth' });
        }
      } else if (e.key === 'Enter' && selectedJob) {
        const safeUrl = toSafeHttpUrl(selectedJob.url);
        if (safeUrl) {
          window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (e.key === 'a' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'applied');
      } else if (e.key === 'i' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'interviewing');
      } else if ((e.key === 't' || e.key === 'o') && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'interested');
      } else if ((e.key === 'n' || e.key === 'x') && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'not_interested');
      } else if ((e.key === 'f' || e.key === 'F') && selectedJob) {
        e.preventDefault();
        setIsDetailFullScreen((prev) => {
          const next = !prev;
          if (!next && layoutMode === 'list') {
            onSelectJob(null);
            updateUrlParam('job', null);
          }
          return next;
        });
      } else if (e.key === 'Escape') {
        if (isDetailFullScreen) {
          setIsDetailFullScreen(false);
          if (layoutMode === 'list') {
            onSelectJob(null);
            updateUrlParam('job', null);
          }
        }
      }
    },
    [displayedJobs, selectedJob, onSelectJob, onUpdateStatus, isDetailFullScreen, layoutMode, updateUrlParam, virtualizer],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCardClick = (job: Job) => {
    onSelectJob(job);
    updateUrlParam('job', String(job.id));
    if (layoutMode === 'list') {
      setIsDetailFullScreen(true);
    } else if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsDetailFullScreen(true);
    } else {
      if (window.scrollY < 70) {
        window.scrollTo({ top: 80, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Search & Filter Toolbar (Linear Hairline Surface) */}
      <Card className="space-y-2.5 p-3 shadow-xs">
        {/* Search Bar with Cmd+K hint */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ds-text-muted" />
            <TextField
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t('jobs.searchPlaceholder')}
              className="h-auto border-ds-border bg-ds-workspace py-1.5 pl-9 pr-16 text-xs focus:bg-ds-workspace"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 rounded p-0.5 text-ds-text-muted hover:text-ds-text-primary"
                aria-label="Clear search query"
              >
                <X className="size-3" />
              </button>
            )}
            {onOpenCommandMenu && (
              <button
                type="button"
                onClick={onOpenCommandMenu}
                className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center rounded border border-ds-border bg-ds-panel px-1.5 py-0.5 font-mono text-[10px] text-ds-text-muted hover:border-ds-border-strong hover:text-ds-text-secondary cursor-pointer"
                title="Open Command Menu (⌘K)"
              >
                ⌘K
              </button>
            )}
          </div>

          {/* Master-Detail / List Toggle (Desktop) */}
          <div className="hidden lg:flex items-center rounded-lg border border-ds-border bg-ds-workspace p-0.5">
            <button
              type="button"
              onClick={() => {
                setLayoutMode('split');
                setIsDetailFullScreen(false);
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-ds-hover text-ds-text-primary shadow-xs border border-ds-border-strong'
                  : 'text-ds-text-muted hover:text-ds-text-secondary hover:bg-ds-hover'
              }`}
              title={t('jobs.layoutSplitTitle')}
            >
              <Columns2 className="size-3.5" />
              <span>{t('jobs.layoutSplit')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLayoutMode('list');
                setIsDetailFullScreen(false);
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'list'
                  ? 'bg-ds-hover text-ds-text-primary shadow-xs border border-ds-border-strong'
                  : 'text-ds-text-muted hover:text-ds-text-secondary hover:bg-ds-hover'
              }`}
              title={t('jobs.layoutListTitle')}
            >
              <Rows3 className="size-3.5" />
              <span>{t('jobs.layoutList')}</span>
            </button>
          </div>
        </div>

        {/* Dropdowns Row with Hairline Selectors */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-ds-border text-xs">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-1.5">
            {/* Match score filter */}
            <div className="ds-field-shell flex w-full items-center justify-between rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <div className="flex items-center min-w-0 flex-1">
                <Sparkles className="size-3 text-ds-warning shrink-0 mr-1.5" />
                <select
                  aria-label={t('jobs.minMatch')}
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="ds-control-focus w-full cursor-pointer bg-transparent text-xs text-ds-text-secondary outline-none"
                >
                  <option value={0} className="bg-ds-panel text-ds-text-secondary">{t('jobs.allMatches')}</option>
                  <option value={75} className="bg-ds-panel text-ds-text-secondary">{t('jobs.fit75')}</option>
                  <option value={55} className="bg-ds-panel text-ds-text-secondary">{t('jobs.fit55')}</option>
                  <option value={35} className="bg-ds-panel text-ds-text-secondary">{t('jobs.fit35')}</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => toggleSort('match')}
                className="ml-1 p-0.5 text-ds-text-muted hover:text-ds-text-secondary cursor-pointer shrink-0"
                title={t('jobs.sortByMatch')}
              >
                {sortField === 'match' ? (
                  sortDir === 'desc' ? <ArrowDown className="size-3 text-ds-text-secondary" /> : <ArrowUp className="size-3 text-ds-text-secondary" />
                ) : (
                  <ArrowUpDown className="size-3" />
                )}
              </button>
            </div>

            {/* Category / Role Domain */}
            <div className="ds-field-shell flex min-w-0 w-full items-center rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <Layers className="size-3 text-ds-accent shrink-0 mr-1.5" />
              <select
                aria-label={t('jobs.allDomains')}
                value={activeDomainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[170px]"
              >
                <option value="all" className="bg-ds-panel text-ds-text-secondary">
                  {t('jobs.allDomains')} ({totalCatalogCount})
                </option>
                {availableDomains.map(({ domain, count }) => (
                  <option key={domain} value={domain} className="bg-ds-panel text-ds-text-secondary">
                    {domain} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Salary */}
            <div className="ds-field-shell flex min-w-0 w-full items-center rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <Banknote className="size-3 text-ds-positive shrink-0 mr-1.5" />
              <select
                aria-label={t('jobs.allSalaries')}
                value={salaryFilter}
                onChange={(e) => setSalaryFilter(e.target.value)}
                className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[130px]"
              >
                <option value="all" className="bg-ds-panel text-ds-text-secondary">{t('jobs.allSalaries')}</option>
                <option value="50k" className="bg-ds-panel text-ds-text-secondary">€50k+</option>
                <option value="60k" className="bg-ds-panel text-ds-text-secondary">€60k+</option>
                <option value="70k" className="bg-ds-panel text-ds-text-secondary">€70k+</option>
                <option value="80k" className="bg-ds-panel text-ds-text-secondary">€80k+</option>
                <option value="disclosed" className="bg-ds-panel text-ds-text-secondary">{t('jobs.disclosedOnly')}</option>
              </select>
            </div>

            {/* Location */}
            <div className="ds-field-shell flex min-w-0 w-full items-center rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <MapPin className="size-3 text-ds-status-new shrink-0 mr-1.5" />
              <select
                aria-label={t('jobs.allLocations')}
                value={activeLocationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[150px]"
              >
                <option value="all" className="bg-ds-panel text-ds-text-secondary">
                  {t('jobs.allLocations')} ({totalCatalogCount})
                </option>
                <optgroup label="Regional Hubs" className="bg-ds-panel text-ds-text-muted">
                  {REGIONAL_LOCATIONS.map((region) => (
                    <option key={region.id} value={region.id} className="bg-ds-panel text-ds-text-secondary">
                      {region.label}
                    </option>
                  ))}
                </optgroup>
                {availableLocations.length > 0 && (
                  <optgroup label="Discovered Locations" className="bg-ds-panel text-ds-text-muted">
                    {availableLocations
                      .filter((l) => !REGIONAL_LOCATIONS.some((r) => r.id === l.loc.toLowerCase()))
                      .map(({ loc, count }) => (
                        <option key={loc} value={loc} className="bg-ds-panel text-ds-text-secondary">
                          {loc} ({count})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Quick status filter pills & Reset filters */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              <Pill
                label={t('common.all')}
                count={formatNumber(statusCounts.all || 0, i18n.language)}
                active={statusFilter === 'all'}
                variant="neutral"
                onClick={() => setStatusFilter('all')}
              />

              {STATUS_LIST.map((status) => {
                const active = statusFilter === status;
                const config = STATUS_FILTER_CONFIG[status];
                return (
                  <Pill
                    key={status}
                    label={t(config?.labelKey || (`status.${status}` as any))}
                    count={formatNumber(statusCounts[status] || 0, i18n.language)}
                    active={active}
                    variant={config?.variant || 'neutral'}
                    onClick={() => setStatusFilter(status)}
                    className="capitalize"
                  />
                );
              })}
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 gap-1.5 border-ds-border-strong px-2.5 font-medium text-ds-accent hover:text-ds-text-primary"
              >
                <X className="size-3" />
                <span>{t('common.resetFilters')}</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Results Subheader */}
      <div className="flex items-center justify-between px-1 text-xs text-ds-text-secondary font-mono">
        <div className="flex items-center gap-3">
          <span>
            {t('jobs.showing')} <strong className="text-ds-text-primary font-semibold">{displayedJobs.length}</strong> {t('jobs.of')} {totalMatchingCount} {t('jobs.opportunities')}
          </span>
          <span className="hidden sm:inline-block text-ds-text-muted">·</span>
          <span className="hidden sm:inline-block text-ds-text-muted font-sans">
            {t('shortcuts.press')} <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↑</kbd> / <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↓</kbd> {t('shortcuts.cycle')} · <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">f</kbd> {t('shortcuts.fullscreen')} · <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↵</kbd> {t('shortcuts.apply')} · <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">a</kbd>/<kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">i</kbd>/<kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">t</kbd>/<kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">n</kbd> {t('shortcuts.status')}
          </span>
        </div>
      </div>

      {/* Master-Detail / Two-Pane Area */}
      {isPageError && displayedJobs.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title={t('common.error')}
          description={pageError instanceof Error ? pageError.message : t('jobs.noOpportunitiesPrompt')}
          action={<Button variant="secondary" onClick={() => void refetch()}>{t('common.retry')}</Button>}
          className="max-w-md mx-auto p-12"
        />
      ) : isPageLoading && displayedJobs.length === 0 ? (
        <div className="rounded-xl border border-ds-border bg-ds-panel p-12 text-center space-y-3 max-w-md mx-auto">
          <RefreshCw className="size-6 animate-spin mx-auto text-ds-text-muted" />
          <div className="text-xs font-medium text-ds-text-secondary">{t('jobs.loadingOpportunities')}</div>
        </div>
      ) : displayedJobs.length > 0 ? (
        <div className={`grid gap-3.5 ${layoutMode === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'}`}>
          {/* Left Pane (Master List) */}
          <div
            ref={listContainerRef}
            className={`h-[calc(100vh-9rem)] overflow-y-auto space-y-2 ${layoutMode === 'split' ? 'lg:col-span-5 xl:col-span-5' : 'w-full'}`}
          >
            <div
              className="relative"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const job = displayedJobs[virtualItem.index];
                return (
                  <div
                    key={job.id}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <JobCard
                      ref={(el) => {
                        if (el) cardRefs.current.set(job.id, el);
                        else cardRefs.current.delete(job.id);
                      }}
                      job={job}
                      isSelected={selectedJob?.id === job.id}
                      onSelect={handleCardClick}
                    />
                  </div>
                );
              })}
            </div>

            {hasNextPage && (
              <div className="flex justify-center pt-2 pb-6">
                <Button
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="px-5 py-2 text-xs text-ds-text-secondary hover:text-ds-text-primary border-ds-border bg-ds-panel"
                >
                  {isFetchingNextPage ? (
                    <RefreshCw className="size-3 mr-1.5 animate-spin inline" />
                  ) : null}
                  <span>{t('jobs.loadMore', { count: 40 })}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Right Pane (Detail Inspector in 2-Pane Mode) */}
          {layoutMode === 'split' && (
            <div className="hidden lg:block lg:col-span-7 xl:col-span-7 sticky top-3 h-[calc(100vh-2rem)] rounded-xl border border-ds-border bg-ds-panel shadow-xs overflow-hidden">
              <JobDetailInspector
                job={selectedJob || null}
                onUpdateStatus={onUpdateStatus || (async () => {})}
                isUpdating={isUpdating}
                onClose={() => onSelectJob(null)}
                isFullScreen={false}
                onToggleFullScreen={() => setIsDetailFullScreen(true)}
                userEmail={userEmail}
              />
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={SlidersHorizontal}
          title={t('jobs.noOpportunitiesFound')}
          description={t('jobs.noOpportunitiesPrompt')}
          action={
            <Button
              variant="secondary"
              onClick={handleResetFilters}
              className="text-xs border-ds-border bg-ds-workspace"
            >
              <RefreshCw className="size-3 mr-1 text-ds-text-muted" />
              <span>{t('common.resetFilters')}</span>
            </Button>
          }
          className="max-w-md mx-auto p-12"
        />
      )}

      {/* Full-Screen Reading Mode (Split mode expanded or List mode selection) */}
      <DialogPrimitive.Root open={isDetailFullScreen} onOpenChange={setIsDetailFullScreen}>
      {selectedJob && isDetailFullScreen && (
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ds-canvas/65" />
          <DialogPrimitive.Content
            aria-label={t('jobs.inspector')}
            id="fullscreen-job-dialog"
            className="fixed inset-0 z-50 flex flex-col bg-ds-workspace animate-in fade-in-0 duration-150"
          >
          <div className="flex h-full w-full flex-col overflow-hidden bg-ds-workspace">
            <JobDetailInspector
              job={selectedJob}
              onUpdateStatus={onUpdateStatus || (async () => {})}
              isUpdating={isUpdating}
              onClose={() => {
                setIsDetailFullScreen(false);
                if (layoutMode === 'list') {
                  onSelectJob(null);
                }
              }}
              isFullScreen={true}
              onToggleFullScreen={() => {
                setIsDetailFullScreen(false);
                if (layoutMode === 'list') {
                  onSelectJob(null);
                }
              }}
              userEmail={userEmail}
            />
          </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
      </DialogPrimitive.Root>
    </div>
  );
};
