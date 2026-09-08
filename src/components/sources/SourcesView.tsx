import React, { useState, useMemo } from 'react';
import { ExternalLink, CheckCircle2, Globe } from 'lucide-react';
import type { Source } from '../../types/job';

interface SourcesViewProps {
  sources: Source[];
  notice?: string;
}

export function getSourceVacancies(source: Source): number {
  if (typeof source.vacancies_found === 'number' && source.vacancies_found > 0) {
    return source.vacancies_found;
  }
  if (source.detail) {
    const m =
      source.detail.match(/(\d+)\s+(?:vacanc|opportunit|active role|current vacanc)/i) ||
      source.detail.match(/Found\s+(\d+)/i) ||
      source.detail.match(/Read\s+(\d+)/i);
    if (m) {
      return parseInt(m[1], 10);
    }
  }
  return 0;
}

export const SourcesView: React.FC<SourcesViewProps> = ({
  sources,
  notice,
}) => {
  const [sortField, setSortField] = useState<'vacancies' | 'name' | 'synced'>('vacancies');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const counts = useMemo(() => {
    let withVacancies = 0;
    let tenPlus = 0;
    let twentyPlus = 0;
    let zero = 0;
    let totalVacancies = 0;

    sources.forEach((s) => {
      const v = getSourceVacancies(s);
      totalVacancies += v;
      if (v > 0) withVacancies++;
      if (v >= 10) tenPlus++;
      if (v >= 20) twentyPlus++;
      if (v === 0) zero++;
    });

    return { withVacancies, tenPlus, twentyPlus, zero, totalVacancies };
  }, [sources]);

  const filteredSources = useMemo(() => {
    const list = [...sources];

    list.sort((a, b) => {
      const vA = getSourceVacancies(a);
      const vB = getSourceVacancies(b);
      const comparison = vA - vB;
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [sources, sortField, sortDir]);

  const toggleSort = (field: 'vacancies' | 'name' | 'synced') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action header */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-5 space-y-3.5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-100">
              Data Sources & Career Portals
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400 max-w-2xl">
              Focused on the Irish job market, tracking live vacancies across national career portals and employer boards.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="inline-flex h-9 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-mono text-zinc-300">
              {filteredSources.length} sources · {counts.totalVacancies} vacancies tracked
            </span>
          </div>
        </div>

        {notice && (
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-200">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <p>{notice}</p>
          </div>
        )}

        {/* Sort toolbar */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-900">
          <button
            type="button"
            onClick={() => toggleSort('vacancies')}
            className="flex h-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
          >
            <span>Sort by Vacancies</span>
            <span className="ml-1.5 font-mono text-[10px] text-zinc-500">
              {sortDir === 'desc' ? '▼' : '▲'}
            </span>
          </button>
        </div>
      </div>

      {/* Grid of sources */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSources.map((source) => {
          const vacancies = getSourceVacancies(source);

          return (
            <div
              key={source.id}
              className="group flex flex-col justify-between rounded-xl p-4 border border-zinc-800/80 bg-zinc-950/80 space-y-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900/40"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                      vacancies > 0
                        ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border border-zinc-800 bg-zinc-900/60 text-zinc-500'
                    }`}
                  >
                    <span>
                      {vacancies > 0
                        ? `${vacancies} ${vacancies === 1 ? 'vacancy' : 'vacancies'} found`
                        : '0 vacancies found'}
                    </span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors">
                    {source.name}
                  </h4>

                  <div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 font-mono transition-colors group/link max-w-full"
                      title={source.url}
                    >
                      <Globe className="size-3 shrink-0 text-zinc-500 group-hover/link:text-zinc-300" />
                      <span className="truncate underline decoration-zinc-700 underline-offset-2 group-hover/link:decoration-zinc-400">
                        {source.url}
                      </span>
                      <ExternalLink className="size-3 shrink-0 opacity-60 group-hover/link:opacity-100" />
                    </a>
                  </div>
                </div>
              </div>

              {source.last_synced_at && (
                <div className="pt-2 border-t border-zinc-900 text-[11px] text-zinc-500 font-mono">
                  Synced: {new Date(source.last_synced_at).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
