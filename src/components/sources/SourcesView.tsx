import React, { useState, useMemo } from 'react';
import { ExternalLink, CheckCircle2, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/i18n';
import type { Source } from '../../types/job';

interface SourcesViewProps {
  sources: Source[];
  notice?: string;
}

function getSourceOpportunities(source: Source): number {
  if (typeof source.opportunities_found === 'number' && source.opportunities_found > 0) {
    return source.opportunities_found;
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
  const { t, i18n } = useTranslation();
  const [sortField, setSortField] = useState<'opportunities' | 'name' | 'synced'>('opportunities');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const counts = useMemo(() => {
    let withOpportunities = 0;
    let tenPlus = 0;
    let twentyPlus = 0;
    let zero = 0;
    let totalOpportunities = 0;

    sources.forEach((s) => {
      const v = getSourceOpportunities(s);
      totalOpportunities += v;
      if (v > 0) withOpportunities++;
      if (v >= 10) tenPlus++;
      if (v >= 20) twentyPlus++;
      if (v === 0) zero++;
    });

    return { withOpportunities, tenPlus, twentyPlus, zero, totalOpportunities };
  }, [sources]);

  const filteredSources = useMemo(() => {
    const list = [...sources];

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'synced') {
        const timeA = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
        const timeB = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
        comparison = timeA - timeB;
      } else {
        const vA = getSourceOpportunities(a);
        const vB = getSourceOpportunities(b);
        comparison = vA - vB;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [sources, sortField, sortDir]);

  const toggleSort = (field: 'opportunities' | 'name' | 'synced') => {
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
      <div className="rounded-xl border border-white/[0.08] bg-[#16171b] p-5 space-y-3.5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-100">
              {t('sources.portalTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-300 max-w-2xl">
              {t('sources.portalSubtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="inline-flex h-9 items-center rounded-lg border border-white/[0.12] bg-[#111215] px-3 text-xs font-mono text-zinc-200">
              {t('sources.stats', { sources: filteredSources.length, opportunities: counts.totalOpportunities })}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400">
          {t('sources.reportedCountNote')}
        </p>

        {notice && (
          <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#111215] p-3 text-xs text-zinc-200">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <p>{notice}</p>
          </div>
        )}

        {/* Sort toolbar */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => toggleSort('opportunities')}
            className="flex h-8 items-center justify-center rounded-lg border border-white/[0.12] bg-[#111215] px-3 text-xs font-medium text-zinc-200 hover:border-white/[0.2] hover:text-white transition-colors cursor-pointer"
          >
            <span>{t('sources.sortByOpportunities')}</span>
            <span className="ml-1.5 font-mono text-[10px] text-zinc-400">
              {sortDir === 'desc' ? '▼' : '▲'}
            </span>
          </button>
        </div>
      </div>

      {/* Grid of sources */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSources.map((source) => {
          const opportunities = getSourceOpportunities(source);

          return (
            <div
              key={source.id}
              className="group flex flex-col justify-between rounded-xl p-4 border border-white/[0.08] bg-[#16171b] space-y-3 transition-colors hover:border-white/[0.16] hover:bg-[#191a20]"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                      opportunities > 0
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border border-white/[0.14] bg-[#111215] text-zinc-300 font-medium'
                    }`}
                  >
                    <span>
                      {opportunities > 0
                        ? t('sources.opportunitiesFound', { count: opportunities })
                        : t('sources.noOpportunities')}
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
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white font-mono transition-colors group/link max-w-full"
                      title={source.url}
                    >
                      <Globe className="size-3 shrink-0 text-zinc-400 group-hover/link:text-zinc-200" />
                      <span className="truncate underline decoration-zinc-600 underline-offset-2 group-hover/link:decoration-zinc-300">
                        {source.url}
                      </span>
                      <ExternalLink className="size-3 shrink-0 opacity-70 group-hover/link:opacity-100" />
                    </a>
                  </div>
                </div>
              </div>

              {source.last_synced_at && (
                <div className="pt-2 border-t border-white/[0.06] text-[11px] text-zinc-400 font-mono">
                  {t('sources.lastSynced', { date: formatDate(source.last_synced_at, i18n.language) })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
