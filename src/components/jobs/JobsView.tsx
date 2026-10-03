import React, { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
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
  Map as MapIcon,
} from 'lucide-react';
import type { Job, JobStatus, JobFilterStatus, OverviewMetrics } from '../../types/job';
import { STATUS_LIST } from '../../types/job';
import { JobCard } from './JobCard';
import { JobDetailInspector } from './JobDetailInspector';
import { Button, Card, EmptyState, Pill, TextField } from '@jae-labs/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { useJobByIdQuery, useJobsInfiniteQuery, useUpdateJobSavedMutation } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';
import { statusPillTone } from '../../lib/statusTone';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useJobFilters, type SortField } from './useJobFilters';
import { useKeyboardNavigation } from './useKeyboardNavigation';
import { useJobLayout } from './useJobLayout';

export type { SortField };
const JobsMapView = lazy(() => import('./JobsMapView'));

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
  initialStatusFilter?: 'all' | JobFilterStatus;
  initialDomainFilter?: string;
  initialMinMatch?: number;
  onFilterReset?: () => void;
  onOpenCommandMenu?: () => void;
  userId?: string | null;
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


export const JobsView: React.FC<JobsViewProps> = ({
  jobs = [],
  overviewMetrics,
  selectedJob,
  onSelectJob,
  onUpdateStatus,
  isUpdating = false,
  searchQuery: controlledSearch,
  onSearchChange: setControlledSearch,
  initialStatusFilter = 'new',
  initialDomainFilter = 'all',
  initialMinMatch = 0,
  onFilterReset,
  onOpenCommandMenu,
  userId,
}) => {
  // TanStack Virtual mutates its instance; React Compiler must not memoize this component.
  "use no memo";
  const { t, i18n } = useTranslation('translation');
  const { layoutMode, setLayoutMode, toggleMap, isCompact } = useJobLayout();
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

  const { data: linkedJob } = useJobByIdQuery(urlJobId ?? selectedJob?.id, userId, Boolean(urlJobId || selectedJob));

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
  const scrollToLocationResults = useRef(false);
  const selectMapLocation = useCallback((location: string) => {
    setLocationFilter(location);
    setLayoutMode('list');
    setIsDetailFullScreen(false);
    onSelectJob(null);
    scrollToLocationResults.current = true;
  }, [setLocationFilter, setLayoutMode, onSelectJob]);

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
  } = useJobsInfiniteQuery(userId, queryParams, Boolean(userId));

  const savedMutation = useUpdateJobSavedMutation(userId);
  const handleToggleSaved = useCallback((job: Job) => {
    savedMutation.mutate({ job, saved: !job.is_saved });
  }, [savedMutation]);

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
    const counts: Record<string, number> = { all: sourceJobs.length, saved: sourceJobs.filter((job) => job.is_saved).length };
    for (const s of STATUS_LIST) {
      counts[s] = 0;
    }
    counts['not_interested'] = 0;
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
    if (isServerPaginated) return [];
    const counts = new Map<string, number>();
    const sourceJobs = jobs;
    for (const j of sourceJobs) {
      const domain = (j.domain || 'Uncategorized').trim();
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([domain, count]) => ({ domain, count }));
  }, [isServerPaginated, jobs, overviewMetrics]);

  const activeDomainFilter = domainFilter;

  const availableLocations = useMemo(() => {
    if (overviewMetrics) return overviewMetrics.locations;
    if (isServerPaginated) return [];
    const counts = new Map<string, number>();
    const sourceJobs = jobs;
    for (const j of sourceJobs) {
      const loc = (j.location || '').trim();
      if (loc) {
        counts.set(loc, (counts.get(loc) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([loc, count]) => ({ loc, count }));
  }, [isServerPaginated, jobs, overviewMetrics]);

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

  useEffect(() => {
    if (layoutMode !== 'list' || !scrollToLocationResults.current || !listContainerRef.current) return;
    const list = listContainerRef.current;
    scrollToLocationResults.current = false;
    list.focus({ preventScroll: true });
    list.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [layoutMode, isPageLoading, displayedJobs.length]);

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

  // Detail state follows the owner-scoped query after save/unsave, even if the job leaves the active filter.
  const inspectedJob = selectedJob
    ? (linkedJob?.id === selectedJob.id ? linkedJob : displayedJobs.find((job) => job.id === selectedJob.id) ?? selectedJob)
    : null;

  const prevFilterSignature = useRef(JSON.stringify(queryParams));
  useEffect(() => {
    const currentSignature = JSON.stringify(queryParams);
    if (prevFilterSignature.current !== currentSignature) {
      if (!isPageLoading) {
        if (displayedJobs.length > 0) {
          onSelectJob(displayedJobs[0]);
          if (listContainerRef.current && document.activeElement && document.activeElement.tagName === 'BUTTON') {
            listContainerRef.current.focus({ preventScroll: true });
          }
        } else {
          onSelectJob(null);
        }
        prevFilterSignature.current = currentSignature;
      }
    }
  }, [queryParams, isPageLoading, displayedJobs, onSelectJob]);

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
        if (match && (layoutMode === 'list' || layoutMode === 'map' || (typeof window !== 'undefined' && window.innerWidth < 1024))) {
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
    selectedJob: inspectedJob,
    onSelectJob,
    onUpdateStatus,
    onToggleSaved: handleToggleSaved,
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
      <Card className="shrink-0 space-y-2.5 p-3 shadow-xs">
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
                className="absolute right-12 top-1/2 -translate-y-1/2 rounded-ds-control p-0.5 text-ds-text-muted hover:text-ds-text-primary"
                aria-label={t('jobs.clearSearch')}
              >
                <X className="size-3" />
              </button>
            )}
            {onOpenCommandMenu && (
              <button
                type="button"
                onClick={onOpenCommandMenu}
                className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center rounded-ds-control border border-ds-border bg-ds-panel px-1.5 py-0.5 font-mono text-[10px] text-ds-text-muted hover:border-ds-border-strong hover:text-ds-text-secondary cursor-pointer"
                title={t('jobs.openCommandMenu')}
                aria-label={t('jobs.openCommandMenu')}
              >
                ⌘K
              </button>
            )}
          </div>

          <div className="flex items-center rounded-ds-control border border-ds-border bg-ds-surface p-0.5">
            <button
              type="button"
              onClick={() => {
                setLayoutMode('split');
                setIsDetailFullScreen(false);
              }}
              className={`hidden lg:flex items-center gap-1.5 rounded-ds-control px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-ds-hover text-ds-text-primary shadow-xs border border-ds-border-strong'
                  : 'text-ds-text-muted hover:text-ds-text-secondary hover:bg-ds-hover'
              }`}
              aria-pressed={layoutMode === 'split'}
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
              className={`hidden lg:flex items-center gap-1.5 rounded-ds-control px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                layoutMode === 'list'
                  ? 'bg-ds-hover text-ds-text-primary shadow-xs border border-ds-border-strong'
                  : 'text-ds-text-muted hover:text-ds-text-secondary hover:bg-ds-hover'
              }`}
              aria-pressed={layoutMode === 'list'}
              title={t('jobs.layoutListTitle')}
            >
              <Rows3 className="size-3.5" />
              <span>{t('jobs.layoutList')}</span>
            </button>
            <button type="button" onClick={() => { toggleMap(); setIsDetailFullScreen(false); }}
              aria-pressed={layoutMode === 'map'} title={t('jobs.layoutMapTitle')}
              className={`flex items-center gap-1.5 rounded-ds-control px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${layoutMode === 'map' ? 'bg-ds-hover text-ds-text-primary shadow-xs border border-ds-border-strong' : 'text-ds-text-muted hover:text-ds-text-secondary hover:bg-ds-hover'}`}>
              <MapIcon className="size-3.5" /><span>{t('jobs.layoutMap')}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-2 border-t border-ds-border text-xs">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-1.5">
            <div className="ds-field-shell flex w-full items-center justify-between rounded-ds-control border px-2 py-1.5 sm:w-auto sm:py-1">
              <div className="flex items-center min-w-0 flex-1">
                <select
                  aria-label={t('jobs.minMatch')}
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[140px]"
                >
                  <option value={0} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.allMatches')}
                  </option>
                  <option value={75} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.fit75')}
                  </option>
                  <option value={55} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.fit55')}
                  </option>
                  <option value={35} className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.fit35')}
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

            <div className="ds-field-shell flex w-full items-center justify-between rounded-ds-control border px-2 py-1.5 sm:w-auto sm:py-1">
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
                  {activeDomainFilter !== 'all' && !availableDomains.some(({ domain }) => domain === activeDomainFilter) && (
                    <option value={activeDomainFilter}>{activeDomainFilter}</option>
                  )}
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


            <div className="ds-field-shell flex w-full items-center justify-between rounded-ds-control border px-2 py-1.5 sm:w-auto sm:py-1">
              <div className="flex items-center min-w-0 flex-1">
                <select
                  aria-label={t('jobs.allSalaries')}
                  value={salaryFilter}
                  onChange={(e) => setSalaryFilter(e.target.value)}
                  className="ds-control-focus w-full cursor-pointer truncate bg-transparent text-xs text-ds-text-secondary outline-none sm:max-w-[130px]"
                >
                  <option value="all" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.allSalaries')}
                  </option>
                  <option value="50k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary50k')}
                  </option>
                  <option value="60k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary60k')}
                  </option>
                  <option value="70k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary70k')}
                  </option>
                  <option value="80k" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.salary80k')}
                  </option>
                  <option value="disclosed" className="bg-ds-panel text-ds-text-secondary">
                    {t('jobs.disclosedOnly')}
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

            <div className="ds-field-shell flex w-full items-center justify-between rounded-ds-control border px-2 py-1.5 sm:w-auto sm:py-1">
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
                  {activeLocationFilter !== 'all' &&
                    !REGIONAL_LOCATIONS.some((region) => region.id === activeLocationFilter) &&
                    !availableLocations.some(({ loc }) => loc.slice(0, 80) === activeLocationFilter && !REGIONAL_LOCATIONS.some((region) => region.id === loc.toLowerCase())) ?
                    <option value={activeLocationFilter}>{activeLocationFilter}</option> : null}
                  <optgroup label={t('jobs.regionalHubs')} className="bg-ds-panel text-ds-text-muted">
                    {REGIONAL_LOCATIONS.map((region) => (
                      <option key={region.id} value={region.id} className="bg-ds-panel text-ds-text-secondary">
                        {region.id === 'ireland' ? t('jobs.irelandNationalRemote') : region.label}
                      </option>
                    ))}
                  </optgroup>
                  {availableLocations.length > 0 && (
                    <optgroup label={t('jobs.discoveredLocations')} className="bg-ds-panel text-ds-text-muted">
                      {availableLocations
                        .filter((l) => !REGIONAL_LOCATIONS.some((r) => r.id === l.loc.toLowerCase()))
                        .map(({ loc, count }) => (
                          <option key={loc} value={loc.slice(0,80)} className="bg-ds-panel text-ds-text-secondary">
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

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              {[...STATUS_LIST, 'not_interested' as const, 'saved' as const].map((status) => {
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

      {layoutMode !== 'map' && <div className="shrink-0 flex items-center justify-between px-1 text-xs text-ds-text-secondary font-mono">
        <div className="flex items-center gap-3">
          <span>
            {t('jobs.showing')} <strong className="text-ds-text-primary font-semibold">{displayedJobs.length}</strong> {t('jobs.of')} {totalMatchingCount} {t('jobs.opportunities')}
          </span>
          <span className="hidden sm:inline-block text-ds-text-muted">·</span>
          <span className="hidden sm:inline-block text-ds-text-muted font-sans">
            {t('shortcuts.press')} <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↑</kbd> / <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↓</kbd> {t('shortcuts.cycle')} · <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">f</kbd> {t('shortcuts.fullscreen')} · <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">←</kbd> / <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">→</kbd> {t('shortcuts.status')} · <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">↵</kbd> {t('shortcuts.apply')} · <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">s</kbd> {t('shortcuts.star')} · <kbd className="rounded-ds-control border border-ds-border-strong bg-ds-panel px-1.5 py-0.5 text-[10px] font-mono text-ds-text-secondary font-medium">d</kbd> {t('shortcuts.delete')}
          </span>
        </div>
      </div>}

      {layoutMode === 'map' ? (
        <Suspense fallback={<div role="status">{t('jobs.mapLoading')}</div>}>
          <JobsMapView userId={userId} filters={queryParams} onSelectLocation={isCompact ? selectMapLocation : undefined} onSelectJob={(id) => {
            updateUrlParam('job', String(id)); setIsDetailFullScreen(true);
          }} />
        </Suspense>
      ) : isPageError && displayedJobs.length === 0 ? (
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
          <Card className="p-12 text-center space-y-3 max-w-md mx-auto">
            <RefreshCw className="size-6 animate-spin mx-auto text-ds-text-muted" />
            <div className="text-xs font-medium text-ds-text-secondary">{t('jobs.loadingOpportunities')}</div>
          </Card>
        </div>
      ) : displayedJobs.length > 0 ? (
        <div className={`flex-1 min-h-0 grid gap-3.5 ${layoutMode === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'}`}>
          <div
            ref={listContainerRef}
            tabIndex={-1}
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
                      userId={userId}
                      isSelected={isCardSelected}
                      tabIndex={isCardFocusable ? 0 : -1}
                      onSelect={handleCardClick}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {layoutMode === 'split' && (
            <Card className="hidden lg:flex lg:flex-col lg:col-span-7 xl:col-span-7 h-full min-h-0 shadow-xs overflow-hidden">
              <JobDetailInspector
                job={inspectedJob}
                onUpdateStatus={onUpdateStatus || (async () => {})}
                isUpdating={isUpdating}
                onClose={() => onSelectJob(null)}
                isFullScreen={false}
                onToggleFullScreen={() => setIsDetailFullScreen(true)}
                userId={userId}
              />
            </Card>
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

      <DialogPrimitive.Root open={isDetailFullScreen} onOpenChange={setIsDetailFullScreen}>
      {selectedJob && isDetailFullScreen && (
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ds-content-enter fixed inset-0 z-50 bg-ds-canvas/65" />
          <DialogPrimitive.Content
            ref={dialogContentRef}
            aria-label={t('jobs.inspector')}
            id="fullscreen-job-dialog"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              dialogContentRef.current?.focus({ preventScroll: true });
            }}
            className="fixed inset-0 z-50 flex flex-col bg-ds-surface ds-content-enter focus:outline-none focus-visible:outline-none"
          >
          <div className="flex h-full w-full flex-col overflow-hidden bg-ds-surface">
            <JobDetailInspector
              job={inspectedJob}
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
              userId={userId}
            />
          </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
      </DialogPrimitive.Root>
    </div>
  );
};
