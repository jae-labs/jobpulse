import React, { useState, useMemo } from 'react';
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


interface OverviewViewProps {
  jobs: Job[];
  overviewMetrics?: OverviewMetrics;
  onNavigateToJobs: (filters?: {
    status?: 'all' | JobStatus;
    domain?: string;
    minMatch?: number;
  }) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  jobs,
  overviewMetrics,
  onNavigateToJobs,
}) => {
  const [overviewWidgetOrder, setOverviewWidgetOrder] = useState<OverviewWidgetId[]>([
    ...overviewWidgetIds,
  ]);

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
          <SortableWidget id={widgetId} label="Monitored opportunities in pool" className="sm:col-span-1 md:col-span-4">
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
          <SortableWidget id={widgetId} label="High-fit match opportunities" className="sm:col-span-1 md:col-span-4">
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
          <SortableWidget id={widgetId} label="In pipeline" className="sm:col-span-2 md:col-span-4">
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
          <SortableWidget id={widgetId} label="Jobs per category breakdown" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle="Unable to load category breakdown chart">
              <CategoryBreakdownChart
                jobs={jobs}
                categories={overviewMetrics?.categories}
                totalJobs={overviewMetrics?.total}
                onSelectCategory={(category) => onNavigateToJobs({ domain: category, status: 'all', minMatch: 0 })}
              />
            </ErrorBoundary>
          </SortableWidget>
        );

      case 'application-pipeline':
        return (
          <SortableWidget id={widgetId} label="Application pipeline chart" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle="Unable to load pipeline chart">
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
          <SortableWidget id={widgetId} label="Match relevance distribution" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle="Unable to load relevance distribution chart">
              <RelevanceDistributionChart
                jobs={jobs}
                distribution={overviewMetrics?.relevance_distribution}
              />
            </ErrorBoundary>
          </SortableWidget>
        );

      case 'skills-radar':
        return (
          <SortableWidget id={widgetId} label="Top matched skills" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <ErrorBoundary fallbackTitle="Unable to load skills chart">
              <SkillsFrequencyChart
                jobs={jobs}
                topSkills={overviewMetrics?.top_skills}
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
              <div className="col-span-12 p-8 text-center text-xs text-neutral-400">
                <RefreshCw className="size-4 animate-spin inline mr-2 text-zinc-400" />
                Loading analytics widgets...
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
