import React, { useState, useMemo } from 'react';
import { ChevronDown, ExternalLink, CheckCircle2, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/i18n';
import type { Source } from '../../types/job';
import { Button, Card, PageHeader, Pill } from '../../design-system';

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
      <Card className="space-y-3.5 p-5 shadow-xs">
        <PageHeader
          title={t('sources.portalTitle')}
          description={t('sources.portalSubtitle')}
          actions={(
            <span className="inline-flex h-9 items-center rounded-lg border border-ds-border-strong bg-ds-workspace px-3 text-xs font-mono text-ds-text-secondary">
              {t('sources.stats', { sources: filteredSources.length, opportunities: counts.totalOpportunities })}
            </span>
          )}
        />

        <p className="text-[11px] text-ds-text-muted">
          {t('sources.reportedCountNote')}
        </p>

        {notice && (
          <div className="flex items-center gap-2.5 rounded-lg border border-ds-border bg-ds-workspace p-3 text-xs text-ds-text-secondary">
            <CheckCircle2 className="size-4 shrink-0 text-ds-positive" />
            <p>{notice}</p>
          </div>
        )}

        {/* Sort toolbar */}
        <div className="flex items-center gap-2 pt-2 border-t border-ds-border">
          <Button
            type="button"
            onClick={() => toggleSort('opportunities')}
            variant="secondary"
            size="sm"
            className="h-9"
          >
            <span>{t('sources.sortByOpportunities')}</span>
            <ChevronDown className={`size-4 text-ds-text-muted transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* Grid of sources */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSources.map((source) => {
          const opportunities = getSourceOpportunities(source);

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
                    variant={opportunities > 0 ? 'status-applied' : 'neutral'}
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
                    <a
                      href={source.url}
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
                    </a>
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
