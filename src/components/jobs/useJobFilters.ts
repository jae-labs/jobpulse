import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { JobStatus } from '../../types/job';

export type SortField = 'match' | 'location' | 'category' | 'salary';

interface UseJobFiltersOptions {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  initialStatusFilter?: 'all' | JobStatus;
  initialDomainFilter?: string;
  initialMinMatch?: number;
}

export function useJobFilters({
  searchQuery: controlledSearch,
  onSearchChange: setControlledSearch,
  initialStatusFilter = 'all',
  initialDomainFilter = 'all',
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

  const statusParam = searchParams.get('status') as JobStatus | null;
  const statusFilter: 'all' | JobStatus = statusParam || initialStatusFilter || 'all';

  const domainParam = searchParams.get('domain');
  const domainFilter = domainParam || initialDomainFilter || 'all';

  const matchParam = searchParams.get('match');
  const minMatch = matchParam !== null ? Number(matchParam) : initialMinMatch;

  const locationFilter = searchParams.get('location') || 'all';
  const salaryFilter = searchParams.get('salary') || 'all';
  const urlJobId = searchParams.get('job') ? Number(searchParams.get('job')) : null;

  const updateUrlParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value || value === 'all' || value === '0') {
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
    (status: 'all' | JobStatus) => {
      updateUrlParam('status', status === 'all' ? null : status);
    },
    [updateUrlParam]
  );

  const setDomainFilter = useCallback(
    (domain: string) => {
      updateUrlParam('domain', domain === 'all' ? null : domain);
    },
    [updateUrlParam]
  );

  const setMinMatch = useCallback(
    (match: number) => {
      updateUrlParam('match', match === 0 ? null : String(match));
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
      domain: domainFilter,
      minMatch,
      location: locationFilter.slice(0, 80),
      salary: salaryFilter,
      search: activeSearch.slice(0, 80),
      sortBy: sortField,
      sortDir,
    }),
    [statusFilter, domainFilter, minMatch, locationFilter, salaryFilter, activeSearch, sortField, sortDir]
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
        for (const key of ['q', 'status', 'match', 'location', 'domain', 'salary']) {
          next.delete(key);
        }
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
  };
}
