import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
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
import { Button, Card, EmptyState, Pill, TextField } from '@jae-labs/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { useJobByIdQuery, useJobsInfiniteQuery } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';
import { statusPillTone } from '../../lib/statusTone';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useJobFilters, type SortField } from './useJobFilters';
import { useKeyboardNavigation } from './useKeyboardNavigation';

export type { SortField };

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


const REGIONAL_LOCATIONS = [
  { id: 'dublin', label: 'Dublin' },
  { id: 'cork', label: 'Cork' },
  { id: 'galway', label: 'Galway' },
  { id: 'kildare', label: 'Kildare' },
  { id: 'laois', label: 'Laois' },
  { id: 'kilkenny', label: 'Kilkenny' },
  { id: 'ireland', label: 'Ireland' },
] as const;

const REGIONAL_ENTRIES = REGIONAL_LOCATIONS.map((r) => ({
  id: r.id,
  lower: r.id.toLowerCase(),
}));

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
  const { t, i18n } = useTranslation('translation');
  const [layoutMode, setLayoutMode] = useState<'split' | 'list'>('split');
  const [isDetailFullScreen, setIsDetailFullScreen] = useState(false);

  const {
    statusFilter,
    setStatusFilter,
    domainFilter,
    setDomainFilter,
    minMatch,
    setMinMatch,
    locationFilter,
    setLocationFilter,
    salaryFilter,
    setSalaryFilter,
    urlJobId,
    updateUrlParam,
    activeSearch,
    inputDisplayValue,
    handleQueryChange,
    sortField,
    sortDir,
    toggleSort,
    resetFilters,
    queryParams,
  } = useJobFilters({
    searchQuery: controlledSearch,
    onSearchChange: setControlledSearch,
    initialStatusFilter,
    initialDomainFilter,
    initialMinMatch,
  });

  const { data: linkedJob } = useJobByIdQuery(urlJobId, userEmail, Boolean(urlJobId));

  useEffect(() => {
    if (!isDetailFullScreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isDetailFullScreen]);

  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const cardRefCallbacks = useRef(new Map<number, (el: HTMLButtonElement | null) => void>());
  const getCardRefCallback = useCallback((id: number) => {
    let cb = cardRefCallbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLButtonElement | null) => {
        if (el) cardRefs.current.set(id, el);
        else cardRefs.current.delete(id);
      };
      cardRefCallbacks.current.set(id, cb);
    }
    return cb;
  }, []);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

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

  const isServerPaginated = Boolean(pageQueryData);

  const totalCatalogCount = overviewMetrics?.total ?? (jobs.length > 0 ? jobs.length : pageTotal);

  const statusCounts = useMemo(() => {
    if (overviewMetrics?.counts) {
      return {
        all: overviewMetrics.total,
        ...overviewMetrics.counts,
      };
    }
    const sourceJobs = isServerPaginated ? pageItems : jobs;
    const counts: Record<string, number> = { all: sourceJobs.length };
    for (const s of STATUS_LIST) {
      counts[s] = 0;
    }
    for (let i = 0; i < sourceJobs.length; i++) {
      const st = sourceJobs[i].status;
      if (st in counts) {
        counts[st]++;
      }
    }
    return counts;
  }, [jobs, overviewMetrics, pageItems, isServerPaginated]);

  const availableDomains = useMemo(() => {
    if (overviewMetrics?.categories && overviewMetrics.categories.length > 0) {
      return overviewMetrics.categories.map((c) => ({
        domain: c.name,
        count: c.value,
      }));
    }
    const counts = new Map<string, number>();
    const sourceJobs = isServerPaginated ? pageItems : jobs;
    for (const j of sourceJobs) {
      const domain = (j.role_domain || 'General Administration').trim();
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([domain, count]) => ({ domain, count }));
  }, [isServerPaginated, pageItems, jobs, overviewMetrics]);

  const activeDomainFilter = domainFilter;

  const availableLocations = useMemo(() => {
    const counts = new Map<string, number>();
    const sourceJobs = isServerPaginated ? pageItems : jobs;
    for (const j of sourceJobs) {
      const loc = (j.location || '').trim();
      if (loc) {
        counts.set(loc, (counts.get(loc) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([loc, count]) => ({ loc, count }));
  }, [isServerPaginated, pageItems, jobs]);

  const { matchCounts, salaryCounts, regionalCounts } = useMemo(() => {
    const sourceJobs = isServerPaginated ? pageItems : jobs;

    const match = {
      all: totalCatalogCount,
      fit75: 0,
      fit55: 0,
      fit35: 0,
    };

    const salary = {
      all: totalCatalogCount,
      '50k': 0,
      '60k': 0,
      '70k': 0,
      '80k': 0,
      disclosed: 0,
    };

    const regional: Record<string, number> = {};
    for (const region of REGIONAL_LOCATIONS) {
      regional[region.id] = 0;
    }

    for (let i = 0; i < sourceJobs.length; i++) {
      const j = sourceJobs[i];
      const rel = j.relevance ?? 0;
      if (rel >= 75) match.fit75++;
      if (rel >= 55) match.fit55++;
      if (rel >= 35) match.fit35++;

      const isEur = j.salary_currency === 'EUR' || !j.salary_currency;
      const sal = j.salary_max_amount ?? j.salary_min_amount ?? 0;
      if (isEur) {
        if (sal >= 50000) salary['50k']++;
        if (sal >= 60000) salary['60k']++;
        if (sal >= 70000) salary['70k']++;
        if (sal >= 80000) salary['80k']++;
      }
      if (j.salary_max_amount != null || j.salary_min_amount != null || Boolean(j.salary_text?.trim())) {
        salary.disclosed++;
      }

      const locLower = (j.location || '').toLowerCase();
      if (locLower) {
        for (let r = 0; r < REGIONAL_ENTRIES.length; r++) {
          if (locLower.includes(REGIONAL_ENTRIES[r].lower)) {
            regional[REGIONAL_ENTRIES[r].id]++;
          }
        }
      }
    }

    return { matchCounts: match, salaryCounts: salary, regionalCounts: regional };
  }, [isServerPaginated, pageItems, jobs, totalCatalogCount]);

  const activeLocationFilter = locationFilter;

  const [explicitSortField, setExplicitSortField] = useState<SortField | null>(null);

  const hasActiveFilters = Boolean(
    activeSearch.trim() ||
    statusFilter !== 'all' ||
    minMatch > 0 ||
    activeLocationFilter !== 'all' ||
    activeDomainFilter !== 'all' ||
    salaryFilter !== 'all' ||
    sortField !== 'match' ||
    sortDir !== 'desc' ||
    explicitSortField !== null
  );

  const handleToggleSort = (field: SortField) => {
    if (explicitSortField !== field) {
      const defaultDir = field === 'match' || field === 'salary' ? 'desc' : 'asc';
      setExplicitSortField(field);
      toggleSort(field, defaultDir);
    } else {
      toggleSort(field);
    }
  };

  const handleResetFilters = () => {
    resetFilters();
    setExplicitSortField(null);
    onFilterReset?.();
  };

  const displayedJobs = isServerPaginated ? pageItems : jobs;
  const totalMatchingCount = pageQueryData ? pageTotal : displayedJobs.length;
  const hasMoreRow = Boolean(hasNextPage);

  const getScrollElement = useCallback(() => listContainerRef.current, []);
  const estimateSize = useCallback(() => 140, []);
  const getItemKey = useCallback(
    (index: number) => {
      if (index >= displayedJobs.length) return 'load-more-row';
      return displayedJobs[index]?.id ?? index;
    },
    [displayedJobs]
  );

  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: displayedJobs.length + (hasMoreRow ? 1 : 0),
    getScrollElement,
    estimateSize,
    overscan: 6,
    getItemKey,
  });

  // Track whether deep link has been handled so toggling layoutMode doesn't trigger full-screen
  const initialDeepLinkHandledRef = useRef<number | null>(null);

  // Auto-select job from URL param or default to first in split mode
  useEffect(() => {
    if (urlJobId !== null) {
      const match = displayedJobs.find((j) => j.id === urlJobId) ?? linkedJob;
      if (match && match.id !== selectedJob?.id) {
        onSelectJob(match);
      }
      // Only open full-screen once on initial deep-link arrival, not when simply toggling layoutMode
      if (initialDeepLinkHandledRef.current !== urlJobId) {
        initialDeepLinkHandledRef.current = urlJobId;
        if (match && (layoutMode === 'list' || (typeof window !== 'undefined' && window.innerWidth < 1024))) {
          setIsDetailFullScreen(true);
        }
      }
      return;
    }
    initialDeepLinkHandledRef.current = null;
    if (displayedJobs.length === 0) return;
    if (layoutMode === 'split' && !selectedJob && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      onSelectJob(displayedJobs[0]);
    }
  }, [urlJobId, layoutMode, selectedJob, displayedJobs, linkedJob, onSelectJob]);

  useKeyboardNavigation({
    displayedJobs,
    selectedJob,
    onSelectJob,
    onUpdateStatus,
    isDetailFullScreen,
    setIsDetailFullScreen,
    layoutMode,
    updateUrlParam,
    scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, options),
    cardRefs,
  });

  // Ensure DOM focus moves to the selected card when keyboard navigation changes selectedJob
  useEffect(() => {
    if (!selectedJob) return;
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && activeEl.dataset.jobCard === 'true') {
      const targetCard = cardRefs.current.get(selectedJob.id) ||
        listContainerRef.current?.querySelector<HTMLElement>(`[data-job-id="${selectedJob.id}"]`);
      if (targetCard && targetCard !== activeEl) {
        targetCard.focus({ preventScroll: true });
      }
    }
  }, [selectedJob]);

  const handleCardClick = useCallback((job: Job) => {
    onSelectJob(job);
    updateUrlParam('job', String(job.id));
    initialDeepLinkHandledRef.current = job.id;
    if (layoutMode === 'list') {
      setIsDetailFullScreen(true);
    } else if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsDetailFullScreen(true);
    }
  }, [layoutMode, onSelectJob, updateUrlParam]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full space-y-3">
      {/* Search & Filter Toolbar (Linear Hairline Surface) */}
      <Card className="shrink-0 space-y-2.5 p-3 shadow-xs">
        {/* Search Bar with Cmd+K hint */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ds-text-muted" />
            <TextField
              type="search"
              aria-label={t('jobs.searchLabel')}
              value={inputDisplayValue}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t('jobs.searchPlaceholder')}
              className="h-auto border-ds-border bg-ds-surface py-1.5 pl-9 pr-16 text-xs focus:bg-ds-surface"
            />
            {inputDisplayValue && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 rounded p-0.5 text-ds-text-muted hover:text-ds-text-primary"
                aria-label={t('jobs.clearSearch')}
              >
                <X className="size-3" />
              </button>
            )}
            {onOpenCommandMenu && (
              <button
                type="button"
                onClick={onOpenCommandMenu}
                className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center rounded border border-ds-border bg-ds-panel px-1.5 py-0.5 font-mono text-[10px] text-ds-text-muted hover:border-ds-border-strong hover:text-ds-text-secondary cursor-pointer"
                title={t('jobs.openCommandMenu')}
                aria-label={t('jobs.openCommandMenu')}
              >
                ⌘K
              </button>
            )}
          </div>

          {/* Master-Detail / List Toggle (Desktop) */}
          <div className="hidden lg:flex items-center rounded-lg border border-ds-border bg-ds-surface p-0.5">
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
                <select
                  aria-label={t('jobs.minMatch')}
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[140px]"
                >
                  <option value={0} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.allMatches')} ({matchCounts.all})
                  </option>
                  <option value={75} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.fit75')} ({matchCounts.fit75})
                  </option>
                  <option value={55} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.fit55')} ({matchCounts.fit55})
                  </option>
                  <option value={35} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.fit35')} ({matchCounts.fit35})
                  </option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSort('match')}
                className="ml-1 p-0.5 text-ds-text-muted hover:text-ds-text-secondary cursor-pointer shrink-0 transition-colors"
                title={t('jobs.sortByMatch')}
                aria-label={t('jobs.sortByMatch')}
              >
                {explicitSortField !== 'match' ? (
                  <ArrowUpDown className="size-3" />
                ) : sortDir === 'desc' ? (
                  <ArrowDown className="size-3 text-ds-text-secondary" />
                ) : (
                  <ArrowUp className="size-3 text-ds-text-secondary" />
                )}
              </button>
            </div>

            {/* Category / Role Domain */}
            <div className="ds-field-shell flex w-full items-center justify-between rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <div className="flex items-center min-w-0 flex-1">
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
              <button
                type="button"
                onClick={() => handleToggleSort('category')}
                className="ml-1 p-0.5 text-ds-text-muted hover:text-ds-text-secondary cursor-pointer shrink-0 transition-colors"
                title={t('jobs.sortByCategory')}
                aria-label={t('jobs.sortByCategory')}
              >
                {explicitSortField !== 'category' ? (
                  <ArrowUpDown className="size-3" />
                ) : sortDir === 'desc' ? (
                  <ArrowDown className="size-3 text-ds-text-secondary" />
                ) : (
                  <ArrowUp className="size-3 text-ds-text-secondary" />
                )}
              </button>
            </div>

            {/* Salary */}
            <div className="ds-field-shell flex w-full items-center justify-between rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <div className="flex items-center min-w-0 flex-1">
                <select
                  aria-label={t('jobs.allSalaries')}
                  value={salaryFilter}
                  onChange={(e) => setSalaryFilter(e.target.value)}
                  className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[130px]"
                >
                  <option value="all" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.allSalaries')} ({salaryCounts.all})
                  </option>
                  <option value="50k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary50k')} ({salaryCounts['50k']})
                  </option>
                  <option value="60k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary60k')} ({salaryCounts['60k']})
                  </option>
                  <option value="70k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary70k')} ({salaryCounts['70k']})
                  </option>
                  <option value="80k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary80k')} ({salaryCounts['80k']})
                  </option>
                  <option value="disclosed" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.disclosedOnly')} ({salaryCounts.disclosed})
                  </option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSort('salary')}
                className="ml-1 p-0.5 text-ds-text-muted hover:text-ds-text-secondary cursor-pointer shrink-0 transition-colors"
                title={t('jobs.sortBySalary')}
                aria-label={t('jobs.sortBySalary')}
              >
                {explicitSortField !== 'salary' ? (
                  <ArrowUpDown className="size-3" />
                ) : sortDir === 'desc' ? (
                  <ArrowDown className="size-3 text-ds-text-secondary" />
                ) : (
                  <ArrowUp className="size-3 text-ds-text-secondary" />
                )}
              </button>
            </div>

            {/* Location */}
            <div className="ds-field-shell flex w-full items-center justify-between rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
              <div className="flex items-center min-w-0 flex-1">
                <select
                  aria-label={t('jobs.allLocations')}
                  value={activeLocationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[150px]"
                >
                  <option value="all" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.allLocations')} ({totalCatalogCount})
                  </option>
                  <optgroup label={t('jobs.regionalHubs')} className="bg-ds-panel text-ds-text-muted">
                    {REGIONAL_LOCATIONS.map((region) => (
                      <option key={region.id} value={region.id} className="bg-ds-panel text-ds-text-secondary">
                        {region.id === 'ireland' ? t('jobs.irelandNationalRemote') : region.label} ({regionalCounts[region.id] ?? 0})
                      </option>
                    ))}
                  </optgroup>
                  {availableLocations.length > 0 && (
                    <optgroup label={t('jobs.discoveredLocations')} className="bg-ds-panel text-ds-text-muted">
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
              <button
                type="button"
                onClick={() => handleToggleSort('location')}
                className="ml-1 p-0.5 text-ds-text-muted hover:text-ds-text-secondary cursor-pointer shrink-0 transition-colors"
                title={t('jobs.sortByLocation')}
                aria-label={t('jobs.sortByLocation')}
              >
                {explicitSortField !== 'location' ? (
                  <ArrowUpDown className="size-3" />
                ) : sortDir === 'desc' ? (
                  <ArrowDown className="size-3 text-ds-text-secondary" />
                ) : (
                  <ArrowUp className="size-3 text-ds-text-secondary" />
                )}
              </button>
            </div>
          </div>

          {/* Quick status filter pills & Reset filters */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              <Pill
                label={t('common.all')}
                count={formatNumber(statusCounts.all || 0, i18n.language)}
                active={statusFilter === 'all'}
                tone="neutral"
                onClick={() => setStatusFilter('all')}
              />

              {STATUS_LIST.map((status) => {
                const active = statusFilter === status;
                return (
                  <Pill
                    key={status}
                    label={t(`status.${status}`)}
                    count={formatNumber(statusCounts[status] || 0, i18n.language)}
                    active={active}
                    tone={statusPillTone[status]}
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
                className="h-7 border-ds-border-strong px-2.5 font-medium text-ds-accent hover:text-ds-text-primary"
              >
                <span>{t('common.resetFilters')}</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Results Subheader */}
      <div className="shrink-0 flex items-center justify-between px-1 text-xs text-ds-text-secondary font-mono">
        <div className="flex items-center gap-3">
          <span>
            {t('jobs.showing')} <strong className="text-ds-text-primary font-semibold">{displayedJobs.length}</strong> {t('jobs.of')} {totalMatchingCount} {t('jobs.opportunities')}
          </span>
          <span className="hidden sm:inline-block text-ds-text-muted">·</span>
          <span className="hidden sm:inline-block text-ds-text-muted font-sans">
            {t('shortcuts.press')} <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↑</kbd> / <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↓</kbd> {t('shortcuts.cycle')} · <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">f</kbd> {t('shortcuts.fullscreen')} · <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↵</kbd> {t('shortcuts.apply')} · <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">←</kbd> / <kbd className="rounded border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">→</kbd> {t('shortcuts.status')}
          </span>
        </div>
      </div>

      {/* Master-Detail / Two-Pane Area */}
      {isPageError && displayedJobs.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <EmptyState
            icon={SlidersHorizontal}
            title={t('common.error')}
            description={pageError instanceof Error ? pageError.message : t('jobs.noOpportunitiesPrompt')}
            action={<Button variant="secondary" onClick={() => void refetch()}>{t('common.retry')}</Button>}
            className="max-w-md mx-auto p-12"
          />
        </div>
      ) : isPageLoading && displayedJobs.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <div className="rounded-xl border border-ds-border bg-ds-panel p-12 text-center space-y-3 max-w-md mx-auto">
            <RefreshCw className="size-6 animate-spin mx-auto text-ds-text-muted" />
            <div className="text-xs font-medium text-ds-text-secondary">{t('jobs.loadingOpportunities')}</div>
          </div>
        </div>
      ) : displayedJobs.length > 0 ? (
        <div className={`flex-1 min-h-0 grid gap-3.5 ${layoutMode === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'}`}>
          {/* Left Pane (Master List) */}
          <div
            ref={listContainerRef}
            className={`h-full min-h-0 overflow-y-auto overscroll-contain pr-1 ${layoutMode === 'split' ? 'lg:col-span-5 xl:col-span-5' : 'w-full'}`}
          >
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px`, minHeight: '100%' }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const isLoaderRow = virtualItem.index >= displayedJobs.length;

                if (isLoaderRow) {
                  return (
                    <div
                      key="load-more-row"
                      ref={virtualizer.measureElement}
                      data-index={virtualItem.index}
                      className="absolute left-0 top-0 w-full flex justify-center pt-2 pb-8"
                      style={{ transform: `translateY(${virtualItem.start}px)` }}
                    >
                      <Button
                        variant="secondary"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="px-5 py-2 text-xs text-ds-text-secondary hover:text-ds-text-primary border-ds-border bg-ds-panel cursor-pointer"
                      >
                        {isFetchingNextPage ? (
                          <RefreshCw className="size-3 mr-1.5 animate-spin inline" />
                        ) : null}
                        <span>{t('jobs.loadMore', { count: 40 })}</span>
                      </Button>
                    </div>
                  );
                }

                const job = displayedJobs[virtualItem.index];
                if (!job) return null;

                const isCardSelected = selectedJob?.id === job.id;
                const isCardFocusable = selectedJob ? isCardSelected : virtualItem.index === 0;
                return (
                  <div
                    key={job.id}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <JobCard
                      ref={getCardRefCallback(job.id)}
                      job={job}
                      isSelected={isCardSelected}
                      tabIndex={isCardFocusable ? 0 : -1}
                      onSelect={handleCardClick}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane (Detail Inspector in 2-Pane Mode) */}
          {layoutMode === 'split' && (
            <div className="hidden lg:flex lg:flex-col lg:col-span-7 xl:col-span-7 h-full min-h-0 rounded-xl border border-ds-border bg-ds-panel shadow-xs overflow-hidden">
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
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <EmptyState
            icon={SlidersHorizontal}
            title={t('jobs.noOpportunitiesFound')}
            description={t('jobs.noOpportunitiesPrompt')}
            action={
              <Button
                variant="secondary"
                onClick={handleResetFilters}
                className="text-xs border-ds-border bg-ds-surface cursor-pointer"
              >
                <span>{t('common.resetFilters')}</span>
              </Button>
            }
            className="max-w-md mx-auto p-12"
          />
        </div>
      )}

      {/* Full-Screen Reading Mode (Split mode expanded or List mode selection) */}
      <DialogPrimitive.Root open={isDetailFullScreen} onOpenChange={setIsDetailFullScreen}>
      {selectedJob && isDetailFullScreen && (
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ds-canvas/65" />
          <DialogPrimitive.Content
            ref={dialogContentRef}
            aria-label={t('jobs.inspector')}
            id="fullscreen-job-dialog"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              dialogContentRef.current?.focus({ preventScroll: true });
            }}
            className="fixed inset-0 z-50 flex flex-col bg-ds-surface animate-in fade-in-0 duration-150 focus:outline-none focus-visible:outline-none"
          >
          <div className="flex h-full w-full flex-col overflow-hidden bg-ds-surface">
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
