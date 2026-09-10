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
import { StatusPill } from '../ui/StatusPill';
import { Sheet, SheetContent } from '../ui/sheet';
import { Button } from '../ui/button';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useJobsPageQuery } from '../../hooks/useQueries';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('translation');
  const [internalQuery, setInternalQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('match');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [displayCount, setDisplayCount] = useState<number>(40);
  const [layoutMode, setLayoutMode] = useState<'split' | 'list'>('split');
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
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

  const query = controlledSearch !== undefined
    ? controlledSearch
    : (searchParams.get('q') ?? internalQuery);

  const updateUrlParam = useCallback((key: string, value: string | null) => {
    setDisplayCount(40);
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

  const queryParams = useMemo(() => ({
    status: statusFilter,
    domain: domainFilter,
    minMatch,
    location: locationFilter,
    salary: salaryFilter,
    search: query,
    sortBy: sortField,
    sortDir,
    limit: displayCount,
    offset: 0,
  }), [statusFilter, domainFilter, minMatch, locationFilter, salaryFilter, query, sortField, sortDir, displayCount]);

  const { data: pageData, isLoading: isPageLoading } = useJobsPageQuery(
    userEmail,
    queryParams,
    Boolean(userEmail)
  );

  const handleQueryChange = (val: string) => {
    setDisplayCount(40);
    if (setControlledSearch) {
      setControlledSearch(val);
    } else {
      setInternalQuery(val);
      updateUrlParam('q', val.trim() || null);
    }
  };

  const toggleSort = (field: SortField) => {
    setDisplayCount(40);
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
    const counts: Record<string, number> = { all: jobs.length };
    for (const s of STATUS_LIST) {
      counts[s] = jobs.filter((j) => j.status === s).length;
    }
    return counts;
  }, [jobs, overviewMetrics]);

  // Jobs matching other active filters
  const baseFilteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesMinMatch = job.relevance >= minMatch;
      const text = `${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`.toLowerCase();
      const matchesQuery = !query.trim() || text.includes(query.toLowerCase());

      const matchesSalary = matchesSalaryFilter(job.salary_text, salaryFilter);

      return matchesStatus && matchesMinMatch && matchesQuery && matchesSalary;
    });
  }, [jobs, statusFilter, minMatch, query, salaryFilter]);

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

  const isDomainValid = domainFilter === 'all' || availableDomains.some((d) => d.domain === domainFilter);
  const activeDomainFilter = isDomainValid ? domainFilter : 'all';

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

  const isLocationValid =
    locationFilter === 'all' ||
    availableLocations.some((s) => s.loc.toLowerCase() === locationFilter.toLowerCase());
  const activeLocationFilter = isLocationValid ? locationFilter : 'all';

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
    handleQueryChange('');
    setStatusFilter('all');
    setMinMatch(0);
    setLocationFilter('all');
    setDomainFilter('all');
    setSalaryFilter('all');
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

  const visibleJobs = useMemo(() => {
    return filteredJobs.slice(0, displayCount);
  }, [filteredJobs, displayCount]);

  const displayedJobs = useMemo(() => {
    return pageData ? pageData.items : visibleJobs;
  }, [pageData, visibleJobs]);
  const totalMatchingCount = pageData ? pageData.total : filteredJobs.length;
  const totalCatalogCount = overviewMetrics?.total ?? (jobs ? jobs.length : 0);

  // Auto-select job from URL param or default to first in split mode
  useEffect(() => {
    if (displayedJobs.length === 0) return;
    if (urlJobId !== null) {
      const match = displayedJobs.find((j) => j.id === urlJobId);
      if (match && match.id !== selectedJob?.id) {
        onSelectJob(match);
        return;
      }
    }
    if (layoutMode === 'split' && !selectedJob && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      onSelectJob(displayedJobs[0]);
    }
  }, [urlJobId, layoutMode, selectedJob, displayedJobs, onSelectJob]);

  // Keyboard navigation: j/k to move up/down, Enter to apply, a/i/o/n to update status
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
          const el = cardRefs.current.get(target.id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
          const el = cardRefs.current.get(target.id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (e.key === 'Enter' && selectedJob) {
        if (selectedJob.url) {
          window.open(selectedJob.url, '_blank', 'noopener,noreferrer');
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
        } else {
          setIsMobileSheetOpen(false);
        }
      }
    },
    [displayedJobs, selectedJob, onSelectJob, onUpdateStatus, isDetailFullScreen, layoutMode, updateUrlParam],
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
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-3 space-y-2.5 shadow-xs">
        {/* Search Bar with Cmd+K hint */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={t('jobs.searchPlaceholder')}
              className="w-full rounded-lg border border-white/[0.08] bg-[#111215] py-1.5 pl-9 pr-16 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-[#111215] focus:ring-1 focus:ring-indigo-500/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-white"
                aria-label="Clear search query"
              >
                <X className="size-3" />
              </button>
            )}
            {onOpenCommandMenu && (
              <button
                type="button"
                onClick={onOpenCommandMenu}
                className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center rounded border border-white/[0.08] bg-[#16171b] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200 cursor-pointer"
                title="Open Command Menu (⌘K)"
              >
                ⌘K
              </button>
            )}
          </div>

          {/* Master-Detail / List Toggle (Desktop) */}
          <div className="hidden lg:flex items-center rounded-lg border border-white/[0.08] bg-[#111215] p-0.5">
            <button
              type="button"
              onClick={() => {
                setLayoutMode('split');
                setIsDetailFullScreen(false);
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-white/[0.12] text-zinc-100 shadow-xs border border-white/[0.1]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
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
                  ? 'bg-white/[0.12] text-zinc-100 shadow-xs border border-white/[0.1]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
              title={t('jobs.layoutListTitle')}
            >
              <Rows3 className="size-3.5" />
              <span>{t('jobs.layoutList')}</span>
            </button>
          </div>
        </div>

        {/* Dropdowns Row with Hairline Selectors */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-white/[0.06] text-xs">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-1.5">
            {/* Match score filter */}
            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#111215] px-2 py-1.5 sm:py-1 w-full sm:w-auto focus-within:border-indigo-500 transition-colors">
              <div className="flex items-center min-w-0 flex-1">
                <Sparkles className="size-3 text-yellow-400 shrink-0 mr-1.5" />
                <select
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full"
                >
                  <option value={0} className="bg-[#16171b] text-zinc-200">{t('jobs.allMatches')}</option>
                  <option value={75} className="bg-[#16171b] text-zinc-200">{t('jobs.fit75')}</option>
                  <option value={55} className="bg-[#16171b] text-zinc-200">{t('jobs.fit55')}</option>
                  <option value={35} className="bg-[#16171b] text-zinc-200">{t('jobs.fit35')}</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => toggleSort('match')}
                className="ml-1 p-0.5 text-zinc-500 hover:text-zinc-300 cursor-pointer shrink-0"
                title={t('jobs.sortByMatch')}
              >
                {sortField === 'match' ? (
                  sortDir === 'desc' ? <ArrowDown className="size-3 text-zinc-200" /> : <ArrowUp className="size-3 text-zinc-200" />
                ) : (
                  <ArrowUpDown className="size-3" />
                )}
              </button>
            </div>

            {/* Category / Role Domain */}
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#111215] px-2 py-1.5 sm:py-1 w-full sm:w-auto min-w-0 focus-within:border-indigo-500 transition-colors">
              <Layers className="size-3 text-purple-400 shrink-0 mr-1.5" />
              <select
                value={activeDomainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full sm:max-w-[170px] truncate"
              >
                <option value="all" className="bg-[#16171b] text-zinc-200">
                  {t('jobs.allDomains')} ({totalCatalogCount})
                </option>
                {availableDomains.map(({ domain, count }) => (
                  <option key={domain} value={domain} className="bg-[#16171b] text-zinc-200">
                    {domain} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Salary */}
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#111215] px-2 py-1.5 sm:py-1 w-full sm:w-auto min-w-0 focus-within:border-indigo-500 transition-colors">
              <Banknote className="size-3 text-emerald-400 shrink-0 mr-1.5" />
              <select
                value={salaryFilter}
                onChange={(e) => setSalaryFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full sm:max-w-[130px] truncate"
              >
                <option value="all" className="bg-[#16171b] text-zinc-200">{t('jobs.allSalaries')}</option>
                <option value="50k" className="bg-[#16171b] text-zinc-200">€50k+</option>
                <option value="60k" className="bg-[#16171b] text-zinc-200">€60k+</option>
                <option value="70k" className="bg-[#16171b] text-zinc-200">€70k+</option>
                <option value="80k" className="bg-[#16171b] text-zinc-200">€80k+</option>
                <option value="disclosed" className="bg-[#16171b] text-zinc-200">{t('jobs.disclosedOnly')}</option>
              </select>
            </div>

            {/* Location */}
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#111215] px-2 py-1.5 sm:py-1 w-full sm:w-auto min-w-0 focus-within:border-indigo-500 transition-colors">
              <MapPin className="size-3 text-sky-400 shrink-0 mr-1.5" />
              <select
                value={activeLocationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full sm:max-w-[150px] truncate"
              >
                <option value="all" className="bg-[#16171b] text-zinc-200">
                  {t('jobs.allLocations')} ({totalCatalogCount})
                </option>
                {availableLocations.map(({ loc, count }) => (
                  <option key={loc} value={loc} className="bg-[#16171b] text-zinc-200">
                    {loc} ({count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick status filter pills & Reset filters */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'border-white/[0.2] bg-white/[0.14] text-zinc-100 shadow-xs'
                    : 'border-white/[0.12] bg-[#111215] text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <span>{t('common.all')}</span>
                <span className="font-mono text-[10px] opacity-80">{statusCounts.all || 0}</span>
              </button>

              {STATUS_LIST.map((status) => {
                const active = statusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors cursor-pointer ${
                      active
                        ? 'border-white/[0.2] bg-white/[0.14] text-zinc-100 shadow-xs'
                        : 'border-white/[0.12] bg-[#111215] text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <StatusPill status={status} />
                    <span className="font-mono text-[10px] opacity-80">{statusCounts[status] || 0}</span>
                  </button>
                );
              })}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <X className="size-3" />
                <span>{t('jobs.resetFilters')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Subheader */}
      <div className="flex items-center justify-between px-1 text-xs text-zinc-300 font-mono">
        <div className="flex items-center gap-3">
          <span>
            {t('jobs.showing')} <strong className="text-zinc-100 font-semibold">{displayedJobs.length}</strong> {t('jobs.of')} {totalMatchingCount} {t('jobs.opportunities')}
          </span>
          <span className="hidden sm:inline-block text-zinc-500">·</span>
          <span className="hidden sm:inline-block text-zinc-400 font-sans">
            {t('shortcuts.press')} <kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">↑</kbd> / <kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">↓</kbd> {t('shortcuts.cycle')} · <kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">f</kbd> {t('shortcuts.fullscreen')} · <kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">↵</kbd> {t('shortcuts.apply')} · <kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">a</kbd>/<kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">i</kbd>/<kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">t</kbd>/<kbd className="rounded border border-white/[0.14] bg-[#16171b] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 font-medium">n</kbd> {t('shortcuts.status')}
          </span>
        </div>
      </div>

      {/* Master-Detail / Two-Pane Area */}
      {isPageLoading && displayedJobs.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-12 text-center space-y-3 max-w-md mx-auto">
          <RefreshCw className="size-6 animate-spin mx-auto text-zinc-400" />
          <div className="text-xs font-medium text-zinc-300">{t('jobs.loadingOpportunities')}</div>
        </div>
      ) : displayedJobs.length > 0 ? (
        <div className={`grid gap-3.5 ${layoutMode === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'}`}>
          {/* Left Pane (Master List) */}
          <div className={`space-y-2 ${layoutMode === 'split' ? 'lg:col-span-5 xl:col-span-5' : 'w-full'}`}>
            <div className="space-y-2">
              {displayedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(job.id, el);
                    else cardRefs.current.delete(job.id);
                  }}
                  job={job}
                  isSelected={selectedJob?.id === job.id}
                  onSelect={handleCardClick}
                />
              ))}
            </div>

            {displayedJobs.length < totalMatchingCount && (
              <div className="flex justify-center pt-2 pb-6">
                <Button
                  variant="secondary"
                  onClick={() => setDisplayCount((prev) => prev + 40)}
                  disabled={isPageLoading}
                  className="px-5 py-2 text-xs text-zinc-300 hover:text-white border-white/[0.08] bg-[#16171b]"
                >
                  {isPageLoading ? (
                    <RefreshCw className="size-3 mr-1.5 animate-spin inline" />
                  ) : null}
                  <span>{t('jobs.loadMore', { count: Math.min(40, totalMatchingCount - displayedJobs.length) })}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Right Pane (Detail Inspector in 2-Pane Mode) */}
          {layoutMode === 'split' && (
            <div className="hidden lg:block lg:col-span-7 xl:col-span-7 sticky top-3 h-[calc(100vh-2rem)] rounded-xl border border-white/[0.08] bg-[#16171b] shadow-xs overflow-hidden">
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
        <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-12 text-center space-y-4 max-w-md mx-auto">
          <SlidersHorizontal className="size-8 mx-auto text-zinc-600" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-200">{t('jobs.noOpportunitiesFound')}</h3>
            <p className="text-xs text-zinc-500">
              {t('jobs.noOpportunitiesPrompt')}
            </p>
          </div>
          <div className="pt-1">
            <Button
              variant="secondary"
              onClick={handleResetFilters}
              className="text-xs border-white/[0.08] bg-[#111215]"
            >
              <RefreshCw className="size-3 mr-1 text-zinc-400" />
              <span>{t('common.resetFilters')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Full-Screen Reading Mode (Split mode expanded or List mode selection) */}
      {selectedJob && isDetailFullScreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Job details full screen"
          id="fullscreen-job-dialog"
          className="fixed inset-0 z-50 flex flex-col bg-[#111215] animate-in fade-in-0 duration-150"
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#111215]">
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
        </div>
      )}

      {/* Slide-over Sheet (Mobile fallback) */}
      <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
        <SheetContent side="right" hideCloseButton className="p-0 sm:max-w-2xl">
          <JobDetailInspector
            job={selectedJob || null}
            onUpdateStatus={onUpdateStatus || (async () => {})}
            isUpdating={isUpdating}
            onClose={() => setIsMobileSheetOpen(false)}
            isSheet={true}
            onToggleFullScreen={() => {
              setIsMobileSheetOpen(false);
              setIsDetailFullScreen(true);
            }}
            userEmail={userEmail}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};
