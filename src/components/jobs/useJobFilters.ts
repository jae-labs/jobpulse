import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { JobFilterStatus, JobAvailability } from '../../types/job';
import { availabilityScope } from '../../lib/jobsRpcArgs';
import { isJobStatus } from '../../types/job';

export type SortField = 'match' | 'location' | 'category' | 'salary';

interface UseJobFiltersOptions {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  initialStatusFilter?: 'all' | JobFilterStatus;
  initialSectorFilter?: string;
  initialMinMatch?: number;
}

export function useJobFilters({
  searchQuery: controlledSearch,
  onSearchChange: setControlledSearch,
  initialStatusFilter = 'new',
  initialSectorFilter = 'all',
  initialMinMatch = 0,
}: UseJobFiltersOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const [internalQuery, setInternalQuery] = useState(urlQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(urlQuery);
  const [sortConfig, setSortConfig] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({
    field: 'match',
    dir: 'desc',
  });
  const sortField = sortConfig.field;
  const sortDir = sortConfig.dir;

  const rawStatus = searchParams.get('status');
  const statusParam = rawStatus === 'interested' ? 'saved' : rawStatus;
  const statusFilter: 'all' | JobFilterStatus = statusParam === null
    ? initialStatusFilter : statusParam === 'all' || statusParam === 'saved' || isJobStatus(statusParam)
      ? statusParam : 'all';

  const rawAvailability = searchParams.get('availability');
  const availability: JobAvailability | 'all' = rawAvailability === 'active' || rawAvailability === 'closed' || rawAvailability === 'unverified' || rawAvailability === 'all' ? rawAvailability : availabilityScope({ status: statusFilter });
  const sectorParam = searchParams.get('sector');
  const sectorFilter = sectorParam || initialSectorFilter || 'all';

  const matchParam = searchParams.get('match');
  const parsedMatch = matchParam !== null ? Number(matchParam) : initialMinMatch;
  const minMatch = Number.isInteger(parsedMatch) && parsedMatch >= 0 && parsedMatch <= 100 ? parsedMatch : 0;

  const locationFilter = searchParams.get('location') || 'all';
  const salaryFilter = searchParams.get('salary') || 'all';
  const parsedJobId = Number(searchParams.get('job'));
  const urlJobId = Number.isSafeInteger(parsedJobId) && parsedJobId > 0 ? parsedJobId : null;

  const updateUrlParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (controlledSearch === undefined && urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setInternalQuery(urlQuery);
    setDebouncedQuery(urlQuery);
  }

  useEffect(() => {
    if (controlledSearch !== undefined) return;
    if (internalQuery === debouncedQuery) return;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(internalQuery);
      updateUrlParam('q', internalQuery.trim() || null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [internalQuery, controlledSearch, debouncedQuery, updateUrlParam]);

  const activeSearch = controlledSearch !== undefined ? controlledSearch : debouncedQuery;
  const inputDisplayValue = controlledSearch !== undefined ? controlledSearch : internalQuery;

  const setStatusFilter = useCallback(
    (status: 'all' | JobFilterStatus) => {
      updateUrlParam('status', status);
    },
    [updateUrlParam]
  );

  const setAvailability = useCallback((value: JobAvailability | 'all') => updateUrlParam('availability', value), [updateUrlParam]);

  const setSectorFilter = useCallback(
    (sector: string) => {
      updateUrlParam('sector', sector);
    },
    [updateUrlParam]
  );

  const setMinMatch = useCallback(
    (match: number) => {
      updateUrlParam('match', String(match));
    },
    [updateUrlParam]
  );

  const setLocationFilter = useCallback(
    (loc: string) => {
      updateUrlParam('location', loc === 'all' ? null : loc);
    },
    [updateUrlParam]
  );

  const setSalaryFilter = useCallback(
    (sal: string) => {
      updateUrlParam('salary', sal === 'all' ? null : sal);
    },
    [updateUrlParam]
  );

  const handleQueryChange = useCallback(
    (val: string) => {
      if (setControlledSearch) {
        setControlledSearch(val);
      } else {
        setInternalQuery(val);
        if (!val) {
          setDebouncedQuery('');
          updateUrlParam('q', null);
        }
      }
    },
    [setControlledSearch, updateUrlParam]
  );

  const toggleSort = useCallback((field: SortField, forceDir?: 'asc' | 'desc') => {
    setSortConfig((prev) => {
      if (forceDir) {
        return { field, dir: forceDir };
      }
      if (prev.field === field) {
        return {
          field,
          dir: prev.dir === 'desc' ? 'asc' : 'desc',
        };
      }
      return {
        field,
        dir: field === 'salary' || field === 'match' ? 'desc' : 'asc',
      };
    });
  }, []);

  const queryParams = useMemo(
    () => ({
      status: statusFilter,
      availability,
      sector: sectorFilter.slice(0, 100),
      minMatch,
      location: locationFilter.slice(0, 80),
      salary: salaryFilter,
      search: activeSearch.slice(0, 80),
      sortBy: sortField,
      sortDir,
    }),
    [statusFilter, availability, sectorFilter, minMatch, locationFilter, salaryFilter, activeSearch, sortField, sortDir]
  );

  const resetFilters = useCallback(() => {
    if (setControlledSearch) {
      setControlledSearch('');
    } else {
      setInternalQuery('');
      setDebouncedQuery('');
    }
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of ['availability', 'q', 'status', 'match', 'location', 'sector', 'salary']) {
          next.delete(key);
        }
        next.set('status', 'all');
        next.set('sector', 'all');
        next.set('match', '0');
        return next;
      },
      { replace: true }
    );
    setSortConfig({ field: 'match', dir: 'desc' });
  }, [setControlledSearch, setSearchParams]);

  return {
    searchParams,
    statusFilter,
    setStatusFilter,
    availability,
    setAvailability,
    sectorFilter,
    setSectorFilter,
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
  };
}
