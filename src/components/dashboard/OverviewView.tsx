import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  Briefcase,
  Sparkles,
  Send,
  RefreshCw,
} from 'lucide-react';
import type { Job, JobStatus, OverviewMetrics } from '../../types/job';
import { SortableWidget } from './SortableWidget';
import { StatCard } from '../ui/StatCard';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useTranslation } from 'react-i18next';

const PipelineChart = React.lazy(() =>
  import('../charts/PipelineChart').then((m) => ({ default: m.PipelineChart }))
);
const RelevanceDistributionChart = React.lazy(() =>
  import('../charts/RelevanceDistributionChart').then((m) => ({ default: m.RelevanceDistributionChart }))
);
const SkillsFrequencyChart = React.lazy(() =>
  import('../charts/SkillsFrequencyChart').then((m) => ({ default: m.SkillsFrequencyChart }))
);
const CategoryBreakdownChart = React.lazy(() =>
  import('../charts/CategoryBreakdownChart').then((m) => ({ default: m.CategoryBreakdownChart }))
);

const overviewWidgetIds = [
  'tracked-opportunities',
  'high-fit-opportunities',
  'pipeline-progress',
  'category-breakdown',
  'application-pipeline',
  'relevance-distribution',
  'skills-radar',
] as const;

type OverviewWidgetId = typeof overviewWidgetIds[number];

function loadWidgetOrder(storageKey: string | null): OverviewWidgetId[] {
  if (!storageKey) return [...overviewWidgetIds];
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(stored)) return [...overviewWidgetIds];
    const known = stored.filter((id): id is OverviewWidgetId => overviewWidgetIds.includes(id));
    return [...new Set(known), ...overviewWidgetIds.filter((id) => !known.includes(id))];
  } catch {
    return [...overviewWidgetIds];
  }
}


interface OverviewViewProps {
  jobs: Job[];
  userId?: string;
  overviewMetrics?: OverviewMetrics;
  onNavigateToJobs: (filters?: {
    status?: 'all' | JobStatus;
    domain?: string;
    minMatch?: number;
    q?: string;
  }) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  jobs,
  userId,
  overviewMetrics,
  onNavigateToJobs,
}) => {
  const storageKey = userId ? `jobpulse:overview-widget-order:${userId}` : null;
  const [overviewWidgetOrder, setOverviewWidgetOrder] = useState<OverviewWidgetId[]>(() => loadWidgetOrder(storageKey));

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(overviewWidgetOrder));
    } catch {
      // Storage may be disabled; the current layout still works in memory.
    }
  }, [overviewWidgetOrder, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleWidgetDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    setOverviewWidgetOrder((widgets) => {
      const oldIndex = widgets.indexOf(active.id as OverviewWidgetId);
      const newIndex = widgets.indexOf(over.id as OverviewWidgetId);
      if (oldIndex < 0 || newIndex < 0) return widgets;
      return arrayMove(widgets, oldIndex, newIndex);
    });
  };

  const counts = useMemo(() => {
    if (overviewMetrics?.counts) return overviewMetrics.counts;
    const map: Record<string, number> = {};
    for (const j of jobs) {
      map[j.status] = (map[j.status] || 0) + 1;
    }
    return map;
  }, [jobs, overviewMetrics?.counts]);

  const highMatchCount = useMemo(() => {
    if (overviewMetrics?.high_fit !== undefined) return overviewMetrics.high_fit;
    return jobs.filter((j) => j.relevance >= 75).length;
  }, [jobs, overviewMetrics]);

  const { t } = useTranslation();
  const totalOpportunitiesCount = overviewMetrics?.total ?? jobs.length;

  const renderOverviewWidget = (widgetId: OverviewWidgetId) => {
    switch (widgetId) {
      case 'tracked-opportunities':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.trackedOpportunities') })} className="sm:col-span-1 md:col-span-4">
            <StatCard
              title={t('overview.trackedOpportunities')}
              value={totalOpportunitiesCount}
              subValue={t('overview.allMonitored')}
              icon={Briefcase}
              onClick={() => onNavigateToJobs({ status: 'all', domain: 'all', minMatch: 0 })}
            />
          </SortableWidget>
        );

      case 'high-fit-opportunities':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.highFitMatches') })} className="sm:col-span-1 md:col-span-4">
            <StatCard
              title={t('overview.highFitMatches')}
              value={highMatchCount}
              subValue={t('overview.highFitSubValue')}
              icon={Sparkles}
              onClick={() => onNavigateToJobs({ status: 'all', domain: 'all', minMatch: 75 })}
            />
          </SortableWidget>
        );

      case 'pipeline-progress':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.inActivePipeline') })} className="sm:col-span-2 md:col-span-4">
            <StatCard
              title={t('overview.inActivePipeline')}
              value={(counts.applied || 0) + (counts.interviewing || 0) + (counts.interested || 0)}
              subValue={`${counts.interviewing || 0} ${t('status.interviewing').toLowerCase()} · ${counts.applied || 0} ${t('status.applied').toLowerCase()}`}
              icon={Send}
              onClick={() => onNavigateToJobs({ status: 'applied', domain: 'all', minMatch: 0 })}
            />
          </SortableWidget>
        );

      case 'category-breakdown':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.categoryBreakdown') })} className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadCategoryChart')}>
              <CategoryBreakdownChart
                jobs={jobs}
                categories={overviewMetrics?.categories}
                totalJobs={overviewMetrics?.total}
                onSelectCategory={(domain) => onNavigateToJobs({ status: 'all', domain, minMatch: 0 })}
              />
            </ErrorBoundary>
          </SortableWidget>
        );

      case 'application-pipeline':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.applicationPipeline') })} className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadPipelineChart')}>
              <PipelineChart
                jobs={jobs}
                counts={counts}
                onSelectStatus={(status) => onNavigateToJobs({ status, domain: 'all', minMatch: 0 })}
              />
            </ErrorBoundary>
          </SortableWidget>
        );

      case 'relevance-distribution':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.relevanceDistribution') })} className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadRelevanceChart')}>
              <RelevanceDistributionChart
                jobs={jobs}
                distribution={overviewMetrics?.relevance_distribution}
                onSelectTier={(minMatch) => onNavigateToJobs({ status: 'all', domain: 'all', minMatch })}
              />
            </ErrorBoundary>
          </SortableWidget>
        );

      case 'skills-radar':
        return (
          <SortableWidget key={widgetId} id={widgetId} reorderLabel={t('common.reorder', { item: t('overview.topSkills') })} className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadSkillsChart')}>
              <SkillsFrequencyChart
                jobs={jobs}
                topSkills={overviewMetrics?.top_skills}
                onSelectSkill={(skill) => onNavigateToJobs({ status: 'all', domain: 'all', minMatch: 0, q: skill })}
              />
            </ErrorBoundary>
          </SortableWidget>
        );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleWidgetDragEnd}
    >
      <SortableContext
        items={overviewWidgetOrder}
        strategy={rectSortingStrategy}
      >
        <div className="bento-grid">
          <React.Suspense
            fallback={
              <div className="col-span-12 p-8 text-center text-xs text-ds-text-muted">
                <RefreshCw className="size-4 animate-spin inline mr-2 text-ds-text-muted" />
                {t('common.loadingWidgets')}
              </div>
            }
          >
            {overviewWidgetOrder.map(renderOverviewWidget)}
          </React.Suspense>
        </div>
      </SortableContext>
    </DndContext>
  );
};
