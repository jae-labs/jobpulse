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
import type { Job, JobStatus } from '../../types/job';
import { STATUS_LIST } from '../../types/job';
import { JobCard } from './JobCard';
import { JobDetailInspector } from './JobDetailInspector';
import { StatusPill } from '../ui/StatusPill';
import { Sheet, SheetContent } from '../ui/sheet';
import { Button } from '../ui/button';

interface JobsViewProps {
  jobs: Job[];
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

export type SortField = 'match' | 'location' | 'category' | 'salary';

export const JobsView: React.FC<JobsViewProps> = ({
  jobs,
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
}) => {
  const [internalQuery, setInternalQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>(initialStatusFilter);
  const [sortField, setSortField] = useState<SortField>('match');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [minMatch, setMinMatch] = useState<number>(initialMinMatch);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>(initialDomainFilter);
  const [salaryFilter, setSalaryFilter] = useState<string>('all');
  const [displayCount, setDisplayCount] = useState<number>(40);
  const [layoutMode, setLayoutMode] = useState<'split' | 'list'>('split');
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatusFilter);
  if (initialStatusFilter !== prevInitialStatus) {
    setPrevInitialStatus(initialStatusFilter);
    setStatusFilter(initialStatusFilter);
  }

  const [prevInitialDomain, setPrevInitialDomain] = useState(initialDomainFilter);
  if (initialDomainFilter !== prevInitialDomain) {
    setPrevInitialDomain(initialDomainFilter);
    setDomainFilter(initialDomainFilter);
  }

  const [prevInitialMinMatch, setPrevInitialMinMatch] = useState(initialMinMatch);
  if (initialMinMatch !== prevInitialMinMatch) {
    setPrevInitialMinMatch(initialMinMatch);
    setMinMatch(initialMinMatch);
  }

  const query = controlledSearch !== undefined ? controlledSearch : internalQuery;

  const filterSignature = `${statusFilter}-${minMatch}-${query}-${salaryFilter}-${domainFilter}-${locationFilter}-${sortField}-${sortDir}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setDisplayCount(40);
  }

  const handleQueryChange = (val: string) => {
    if (setControlledSearch) {
      setControlledSearch(val);
    } else {
      setInternalQuery(val);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir(field === 'match' || field === 'salary' ? 'desc' : 'asc');
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: jobs.length };
    for (const s of STATUS_LIST) {
      counts[s] = jobs.filter((j) => j.status === s).length;
    }
    return counts;
  }, [jobs]);

  // Jobs matching other active filters
  const baseFilteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesMinMatch = job.relevance >= minMatch;
      const text = `${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`.toLowerCase();
      const matchesQuery = !query.trim() || text.includes(query.toLowerCase());

      const matchesSalary = (() => {
        if (salaryFilter === 'all') return true;
        if (salaryFilter === 'disclosed') return Boolean(job.salary_text && job.salary_text.trim());
        const maxSal = parseSalaryMax(job.salary_text);
        if (salaryFilter === '50k') return maxSal !== null && maxSal >= 50000;
        if (salaryFilter === '60k') return maxSal !== null && maxSal >= 60000;
        if (salaryFilter === '70k') return maxSal !== null && maxSal >= 70000;
        if (salaryFilter === '80k') return maxSal !== null && maxSal >= 80000;
        return true;
      })();

      return matchesStatus && matchesMinMatch && matchesQuery && matchesSalary;
    });
  }, [jobs, statusFilter, minMatch, query, salaryFilter]);

  const availableDomains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of baseFilteredJobs) {
      const domain = (j.role_domain || 'General Administration').trim();
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([domain, count]) => ({ domain, count }));
  }, [baseFilteredJobs]);

  const isDomainValid = domainFilter === 'all' || availableDomains.some((d) => d.domain === domainFilter);
  const activeDomainFilter = isDomainValid ? domainFilter : 'all';

  const availableRegions = useMemo(() => {
    const REGION_DEFS = [
      { id: 'dublin', label: 'Dublin Area', match: (loc: string) => loc.includes('dublin') },
      { id: 'kildare', label: 'Kildare / North Kildare', match: (loc: string) => ['kildare', 'maynooth', 'naas', 'leixlip'].some((k) => loc.includes(k)) },
      { id: 'laois', label: 'Laois / Portlaoise', match: (loc: string) => ['laois', 'portlaoise', 'abbeyleix', 'mountmellick', 'portarlington'].some((k) => loc.includes(k)) },
      { id: 'cork', label: 'Cork', match: (loc: string) => ['cork', 'ringaskiddy', 'carrigaline'].some((k) => loc.includes(k)) },
      { id: 'galway', label: 'Galway', match: (loc: string) => loc.includes('galway') },
      { id: 'kilkenny', label: 'Kilkenny', match: (loc: string) => loc.includes('kilkenny') },
      { id: 'ireland', label: 'Ireland / Nationwide', match: (loc: string) => loc.includes('ireland') },
    ];

    return REGION_DEFS.map((reg) => {
      const count = baseFilteredJobs.filter((j) => reg.match((j.location || '').toLowerCase())).length;
      return { ...reg, count };
    }).filter((reg) => reg.count > 0);
  }, [baseFilteredJobs]);

  const availableSpecificLocations = useMemo(() => {
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
    availableRegions.some((r) => r.id === locationFilter) ||
    availableSpecificLocations.some((s) => s.loc === locationFilter);
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
        if (activeLocationFilter === 'dublin') return locLower.includes('dublin');
        if (activeLocationFilter === 'kildare') return ['kildare', 'maynooth', 'naas', 'leixlip'].some((k) => locLower.includes(k));
        if (activeLocationFilter === 'cork') return ['cork', 'ringaskiddy', 'carrigaline'].some((k) => locLower.includes(k));
        if (activeLocationFilter === 'galway') return locLower.includes('galway');
        if (activeLocationFilter === 'kilkenny') return locLower.includes('kilkenny');
        if (activeLocationFilter === 'ireland') return locLower.includes('ireland');
        return job.location === activeLocationFilter;
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

  // Auto-select first job if in split mode on desktop and none selected
  useEffect(() => {
    if (layoutMode === 'split' && !selectedJob && visibleJobs.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      onSelectJob(visibleJobs[0]);
    }
  }, [layoutMode, selectedJob, visibleJobs, onSelectJob]);

  // Keyboard navigation: j/k to move up/down, Enter to apply, a/i/o/n to update status
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = visibleJobs.findIndex((j) => j.id === selectedJob?.id);
        const nextIndex = currentIndex < visibleJobs.length - 1 ? currentIndex + 1 : 0;
        const target = visibleJobs[nextIndex];
        if (target) {
          onSelectJob(target);
          // Scroll down past top header if user is starting from top of page
          if (window.scrollY < 70) {
            window.scrollTo({ top: 80, behavior: 'smooth' });
          }
          const el = cardRefs.current.get(target.id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = visibleJobs.findIndex((j) => j.id === selectedJob?.id);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleJobs.length - 1;
        const target = visibleJobs[prevIndex];
        if (target) {
          onSelectJob(target);
          if (window.scrollY < 70) {
            window.scrollTo({ top: 80, behavior: 'smooth' });
          }
          const el = cardRefs.current.get(target.id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (e.key === 'Enter' && selectedJob?.url) {
        e.preventDefault();
        window.open(selectedJob.url, '_blank', 'noopener,noreferrer');
      } else if (e.key === 'a' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'applied');
      } else if (e.key === 'i' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'interviewing');
      } else if (e.key === 'o' && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'offer');
      } else if ((e.key === 'n' || e.key === 'x') && selectedJob && onUpdateStatus) {
        e.preventDefault();
        void onUpdateStatus(selectedJob, 'not_interested');
      } else if (e.key === 'Escape') {
        setIsMobileSheetOpen(false);
      }
    },
    [visibleJobs, selectedJob, onSelectJob, onUpdateStatus],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCardClick = (job: Job) => {
    onSelectJob(job);
    if (window.scrollY < 70) {
      window.scrollTo({ top: 80, behavior: 'smooth' });
    }
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileSheetOpen(true);
    } else if (layoutMode === 'list') {
      setIsMobileSheetOpen(true);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Search & Filter Toolbar (Linear Hairline Surface) */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-3 space-y-2.5 shadow-xs">
        {/* Search Bar with Cmd+K hint */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Filter by title, company, location, or skills..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-1.5 pl-9 pr-16 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-700 focus:bg-zinc-900 focus:ring-1 focus:ring-zinc-700"
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
                className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 cursor-pointer"
                title="Open Command Menu (⌘K)"
              >
                ⌘K
              </button>
            )}
          </div>

          {/* Master-Detail / List Toggle (Desktop) */}
          <div className="hidden lg:flex items-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setLayoutMode('split')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Two-pane Master-Detail split layout"
            >
              <Columns2 className="size-3.5" />
              <span>Split</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('list')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'list'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Full width list layout"
            >
              <Rows3 className="size-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>

        {/* Dropdowns Row with Hairline Selectors */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-900 text-xs">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-1.5">
            {/* Match score filter */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 sm:py-1 w-full sm:w-auto">
              <div className="flex items-center min-w-0 flex-1">
                <Sparkles className="size-3 text-zinc-400 shrink-0 mr-1.5" />
                <select
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full"
                >
                  <option value={0} className="bg-zinc-950">All Matches</option>
                  <option value={75} className="bg-zinc-950">75%+ Fit</option>
                  <option value={55} className="bg-zinc-950">55%+ Fit</option>
                  <option value={35} className="bg-zinc-950">35%+ Fit</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => toggleSort('match')}
                className="ml-1 p-0.5 text-zinc-500 hover:text-zinc-300 cursor-pointer shrink-0"
                title="Sort by match score"
              >
                {sortField === 'match' ? (
                  sortDir === 'desc' ? <ArrowDown className="size-3 text-zinc-200" /> : <ArrowUp className="size-3 text-zinc-200" />
                ) : (
                  <ArrowUpDown className="size-3" />
                )}
              </button>
            </div>

            {/* Category / Role Domain */}
            <div className="flex items-center rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 sm:py-1 w-full sm:w-auto min-w-0">
              <Layers className="size-3 text-purple-400 shrink-0 mr-1.5" />
              <select
                value={activeDomainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full sm:max-w-[170px] truncate"
              >
                <option value="all" className="bg-zinc-950">
                  All Categories ({baseFilteredJobs.length})
                </option>
                {availableDomains.map(({ domain, count }) => (
                  <option key={domain} value={domain} className="bg-zinc-950 text-zinc-200">
                    {domain} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Salary */}
            <div className="flex items-center rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 sm:py-1 w-full sm:w-auto min-w-0">
              <Banknote className="size-3 text-emerald-400 shrink-0 mr-1.5" />
              <select
                value={salaryFilter}
                onChange={(e) => setSalaryFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full sm:max-w-[130px] truncate"
              >
                <option value="all" className="bg-zinc-950">All Salaries</option>
                <option value="50k" className="bg-zinc-950">€50k+</option>
                <option value="60k" className="bg-zinc-950">€60k+</option>
                <option value="70k" className="bg-zinc-950">€70k+</option>
                <option value="80k" className="bg-zinc-950">€80k+</option>
                <option value="disclosed" className="bg-zinc-950">Disclosed only</option>
              </select>
            </div>

            {/* Location */}
            <div className="flex items-center rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 sm:py-1 w-full sm:w-auto min-w-0">
              <MapPin className="size-3 text-sky-400 shrink-0 mr-1.5" />
              <select
                value={activeLocationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer w-full sm:max-w-[150px] truncate"
              >
                <option value="all" className="bg-zinc-950">
                  All Locations ({baseFilteredJobs.length})
                </option>
                {availableRegions.length > 0 && (
                  <optgroup label="Target Regions" className="bg-zinc-950 text-zinc-500">
                    {availableRegions.map((reg) => (
                      <option key={reg.id} value={reg.id} className="bg-zinc-950 text-zinc-200">
                        {reg.label} ({reg.count})
                      </option>
                    ))}
                  </optgroup>
                )}
                {availableSpecificLocations.length > 0 && (
                  <optgroup label="Locations" className="bg-zinc-950 text-zinc-500">
                    {availableSpecificLocations.map(({ loc, count }) => (
                      <option key={loc} value={loc} className="bg-zinc-950 text-zinc-200">
                        {loc} ({count})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Quick status filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'border-zinc-700 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>All</span>
              <span className="font-mono text-[10px] opacity-70">{statusCounts.all || 0}</span>
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
                      ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                      : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <StatusPill status={status} />
                  <span className="font-mono text-[10px] opacity-70">{statusCounts[status] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Subheader */}
      <div className="flex items-center justify-between px-1 text-xs text-zinc-400 font-mono">
        <div className="flex items-center gap-3">
          <span>
            Showing <strong className="text-zinc-200 font-semibold">{filteredJobs.length}</strong> of {jobs.length} positions
          </span>
          <span className="hidden sm:inline-block text-zinc-600">·</span>
          <span className="hidden sm:inline-block text-zinc-500 font-sans">
            Press <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">j</kbd> / <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">k</kbd> to cycle · <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">↵</kbd> to apply · <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">a</kbd>/<kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">i</kbd>/<kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">o</kbd>/<kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 text-[10px] font-mono text-zinc-300">n</kbd> for status
          </span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
          >
            <X className="size-3" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      {/* Master-Detail / Two-Pane Area */}
      {filteredJobs.length > 0 ? (
        <div className={`grid gap-3.5 ${layoutMode === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'}`}>
          {/* Left Pane (Master List) */}
          <div className={`space-y-2 ${layoutMode === 'split' ? 'lg:col-span-5 xl:col-span-5' : 'w-full'}`}>
            <div className="space-y-2">
              {visibleJobs.map((job) => (
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

            {visibleJobs.length < filteredJobs.length && (
              <div className="flex justify-center pt-2 pb-6">
                <Button
                  variant="secondary"
                  onClick={() => setDisplayCount((prev) => prev + 40)}
                  className="px-5 py-2 text-xs text-zinc-300 hover:text-white border-zinc-800 bg-zinc-900/50"
                >
                  Load {filteredJobs.length - visibleJobs.length} more positions
                </Button>
              </div>
            )}
          </div>

          {/* Right Pane (Detail Inspector in 2-Pane Mode) */}
          {layoutMode === 'split' && (
            <div className="hidden lg:block lg:col-span-7 xl:col-span-7 sticky top-3 h-[calc(100vh-2rem)] rounded-xl border border-zinc-800/80 bg-zinc-950 shadow-xs overflow-hidden">
              <JobDetailInspector
                job={selectedJob || null}
                onUpdateStatus={onUpdateStatus || (async () => {})}
                isUpdating={isUpdating}
                onClose={() => onSelectJob(null)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-12 text-center space-y-4 max-w-md mx-auto">
          <SlidersHorizontal className="size-8 mx-auto text-zinc-600" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-200">No Matching Positions Found</h3>
            <p className="text-xs text-zinc-500">
              No positions match your current criteria. Try resetting filters or adjusting search keywords.
            </p>
          </div>
          <div className="pt-1">
            <Button
              variant="secondary"
              onClick={handleResetFilters}
              className="text-xs border-zinc-800"
            >
              <RefreshCw className="size-3 mr-1 text-zinc-400" />
              <span>Reset All Filters</span>
            </Button>
          </div>
        </div>
      )}

      {/* Slide-over Sheet (Mobile or when in List mode) */}
      <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
        <SheetContent side="right" hideCloseButton className="p-0 sm:max-w-2xl">
          <JobDetailInspector
            job={selectedJob || null}
            onUpdateStatus={onUpdateStatus || (async () => {})}
            isUpdating={isUpdating}
            onClose={() => setIsMobileSheetOpen(false)}
            isSheet={true}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};
