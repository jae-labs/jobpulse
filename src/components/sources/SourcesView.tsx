import React, { useState, useMemo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, CheckCircle2, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNumber } from '../../lib/i18n';
import { toSafeHttpUrl } from '../../lib/utils';
import type { Source } from '../../types/job';
import { Card, PageHeader, Pill } from '@jae-labs/ui';

interface SourcesViewProps {
  sources: Source[];
  notice?: string;
}

function getSourceOpportunities(source: Source): number {
  if (typeof source.opportunities_found === 'number' && source.opportunities_found >= 0) {
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

const SourcesViewComponent: React.FC<SourcesViewProps> = ({
  sources,
  notice,
}) => {
  const { t, i18n } = useTranslation();
  const [sortField, setSortField] = useState<'opportunities' | 'name' | 'synced'>('opportunities');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [hasExplicitSort, setHasExplicitSort] = useState(false);

  const { totalOpportunities, filteredSources } = useMemo(() => {
    let total = 0;
    const mapped = new Array(sources.length);
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const opps = getSourceOpportunities(s);
      total += opps;
      const syncedTime = s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0;
      mapped[i] = { source: s, opps, syncedTime };
    }

    mapped.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.source.name.localeCompare(b.source.name);
      } else if (sortField === 'synced') {
        comparison = a.syncedTime - b.syncedTime;
      } else {
        comparison = a.opps - b.opps;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return {
      totalOpportunities: total,
      filteredSources: mapped,
    };
  }, [sources, sortField, sortDir]);

  const handleSortFieldChange = (field: 'opportunities' | 'name' | 'synced') => {
    setSortField(field);
    setSortDir(field === 'name' ? 'asc' : 'desc');
    setHasExplicitSort(false);
  };

  const handleToggleSortDir = () => {
    setHasExplicitSort(true);
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  };

  return (
    <div className="space-y-4">
      {/* Top action header */}
      <Card className="space-y-3.5 p-5 shadow-xs">
        <PageHeader
          title={t('sources.portalTitle')}
          description={t('sources.portalSubtitle')}
        />

        <p className="text-[11px] text-ds-text-muted">
          {t('sources.reportedCountNote')}
        </p>

        {notice && (
          <div className="flex items-center gap-2.5 rounded-lg border border-ds-border bg-ds-surface p-3 text-xs text-ds-text-secondary">
            <CheckCircle2 className="size-4 shrink-0 text-ds-positive" />
            <p>{notice}</p>
          </div>
        )}

        {/* Sort toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-ds-border text-xs">
          <div className="ds-field-shell flex w-full items-center justify-between rounded-lg border px-2 py-1.5 sm:w-auto sm:py-1">
            <div className="flex items-center min-w-0 flex-1">
              <select
                aria-label={t('sources.sortByLabel')}
                value={sortField}
                onChange={(e) => handleSortFieldChange(e.target.value as 'opportunities' | 'name' | 'synced')}
                className="ds-control-focus w-full cursor-pointer bg-transparent text-xs text-ds-text-secondary outline-none"
              >
                <option value="opportunities" className="bg-ds-panel text-ds-text-secondary">
                  {t('sources.sortByOpportunities')}
                </option>
                <option value="name" className="bg-ds-panel text-ds-text-secondary">
                  {t('sources.sortByName')}
                </option>
                <option value="synced" className="bg-ds-panel text-ds-text-secondary">
                  {t('sources.sortBySynced')}
                </option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleToggleSortDir}
              className="ml-1 p-0.5 text-ds-text-muted hover:text-ds-text-secondary cursor-pointer shrink-0 transition-colors"
              title={t('sources.toggleSortDirection')}
              aria-label={t('sources.toggleSortDirection')}
            >
              {!hasExplicitSort ? (
                <ArrowUpDown className="size-3" />
              ) : sortDir === 'desc' ? (
                <ArrowDown className="size-3 text-ds-text-secondary" />
              ) : (
                <ArrowUp className="size-3 text-ds-text-secondary" />
              )}
            </button>
          </div>
        </div>
      </Card>

      {/* Results Subheader */}
      <div className="shrink-0 flex items-center justify-between px-1 text-xs text-ds-text-secondary font-mono">
        <div className="flex items-center gap-3">
          <span>
            {t('jobs.showing')}{' '}
            <strong className="font-semibold text-ds-text-primary">{filteredSources.length}</strong>{' '}
            {t('jobs.of')}{' '}
            <strong className="font-semibold text-ds-text-primary">{sources.length}</strong>{' '}
            {t('sources.sourcesCount')} ·{' '}
            <strong className="font-semibold text-ds-text-primary">{formatNumber(totalOpportunities, i18n.language)}</strong>{' '}
            {t('sources.opportunitiesReported')}
          </span>
        </div>
      </div>

      {/* Grid of sources */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSources.map(({ source, opps: opportunities }) => {
          return (
            <Card
              key={source.id}
              className="flex flex-col justify-between space-y-3 p-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Pill
                    asChild
                    size="sm"
                    tone={opportunities > 0 ? 'positive' : 'neutral'}
                  >
                    <span>
                      {opportunities > 0
                        ? t('sources.opportunitiesFound', { count: opportunities })
                        : t('sources.noOpportunities')}
                    </span>
                  </Pill>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-sm font-semibold text-ds-text-primary">
                    {source.name}
                  </h4>

                  <div>
                    {toSafeHttpUrl(source.url) ? (
                      <a
                        href={toSafeHttpUrl(source.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-ds-text-secondary hover:text-ds-text-primary font-mono transition-colors group/link max-w-full"
                        title={source.url}
                      >
                        <Globe className="size-3 shrink-0 text-ds-text-muted group-hover/link:text-ds-text-secondary" />
                        <span className="truncate underline decoration-ds-text-muted underline-offset-2 group-hover/link:decoration-ds-text-secondary">
                          {source.url}
                        </span>
                        <ExternalLink className="size-3 shrink-0 opacity-70 group-hover/link:opacity-100" />
                        <span className="sr-only"> ({t('common.opensInNewWindow', 'opens in new tab')})</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ds-text-muted font-mono truncate max-w-full" title={source.url}>
                        <Globe className="size-3 shrink-0 text-ds-text-muted" />
                        <span className="truncate">{source.url}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {source.last_synced_at && (
                <div className="pt-2 border-t border-ds-border text-[11px] text-ds-text-muted font-mono">
                  {t('sources.lastSynced', { date: formatDate(source.last_synced_at, i18n.language) })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export const SourcesView = React.memo(SourcesViewComponent);
