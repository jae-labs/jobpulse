import React, { useState, useMemo } from 'react';
import { ExternalLink, Search, Building2, RefreshCw, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Employer } from '../../types/job';

interface EmployerWatchlistProps {
  employers: Employer[];
  onSyncEmployer?: (name: string) => Promise<void>;
  syncingEmployer?: string | null;
}

export const EmployerWatchlist: React.FC<EmployerWatchlistProps> = ({
  employers,
  onSyncEmployer,
  syncingEmployer,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [localScanning, setLocalScanning] = useState<string | null>(null);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    employers.forEach((e) => {
      if (e.sector) set.add(e.sector);
    });
    return Array.from(set).sort();
  }, [employers]);

  const filteredEmployers = useMemo(() => {
    return employers.filter((e) => {
      const matchesSector = selectedSector === 'all' || e.sector === selectedSector;
      const text = `${e.name} ${e.sector} ${e.status || ''}`.toLowerCase();
      const matchesSearch = !search.trim() || text.includes(search.toLowerCase());
      return matchesSector && matchesSearch;
    });
  }, [employers, search, selectedSector]);

  const handleScan = async (e: React.MouseEvent, employerName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSyncEmployer) return;
    setLocalScanning(employerName);
    try {
      await onSyncEmployer(employerName);
    } finally {
      setLocalScanning(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-white">
              {t('watchlist.title')}
            </h3>
            <p className="mt-1 text-xs text-neutral-300 max-w-2xl">
              {t('watchlist.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="rounded-lg border border-white/[0.08] bg-[#111215] px-3 py-1.5 text-xs font-mono font-medium text-zinc-300">
              {t('watchlist.activeTargets', { count: filteredEmployers.length })}
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-white/[0.06]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              placeholder={t('watchlist.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#111215] py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-[#111215] focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          <div className="relative">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/[0.08] bg-[#111215] px-3 py-2 text-xs text-zinc-200 outline-none transition-colors focus:border-indigo-500 focus:bg-[#111215] focus:ring-1 focus:ring-indigo-500/30 cursor-pointer"
            >
              <option value="all" className="bg-[#16171b] text-zinc-200">
                {t('watchlist.allSectors', { count: employers.length })}
              </option>
              {sectors.map((sector) => {
                const count = employers.filter((e) => e.sector === sector).length;
                return (
                  <option key={sector} value={sector} className="bg-[#16171b] text-zinc-200">
                    {sector} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Grid of employers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredEmployers.map((employer) => {
          const isScanning = syncingEmployer === employer.name || localScanning === employer.name;
          const targetHref = employer.discovered_jobs_url || employer.careers_url;
          const hasDiscovered = Boolean(employer.discovered_jobs_url && employer.discovered_jobs_url !== employer.careers_url);

          return (
            <div
              key={employer.id}
              className="group flex flex-col justify-between rounded-xl p-4 border border-white/[0.08] bg-[#16171b] transition-colors hover:border-white/[0.16] hover:bg-[#191a20] space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#111215] text-zinc-300 border border-white/[0.08]">
                    {employer.sector}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors">
                    {employer.name}
                  </h4>
                  {hasDiscovered && (
                    <p className="mt-1 text-[11px] text-zinc-400 truncate flex items-center gap-1">
                      <Globe className="size-3 text-emerald-400 shrink-0" />
                      <span className="truncate font-mono">{employer.discovered_jobs_url}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs text-zinc-400">
                <a
                  href={targetHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-medium text-zinc-300 hover:text-white transition-colors"
                >
                  <Building2 className="size-3.5 text-zinc-400" />
                  <span>{hasDiscovered ? t('watchlist.discoveredBoard') : t('watchlist.careersPage')}</span>
                  <ExternalLink className="size-3" />
                </a>

                {onSyncEmployer && (
                  <button
                    type="button"
                    onClick={(e) => void handleScan(e, employer.name)}
                    disabled={isScanning}
                    className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`size-3 text-zinc-400 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>{isScanning ? t('watchlist.scanning') : t('watchlist.scanNow')}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
