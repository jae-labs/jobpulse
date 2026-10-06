import { createPortal } from 'react-dom';
import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  Briefcase,
  Building2,
  Sparkles,
  Send,
  Star,
  RefreshCw,
} from 'lucide-react';
import type { JobFilterStatus, OverviewMetrics } from '../../types/job';
import { SortableWidget } from './SortableWidget';
import { readWidgetSizes, widgetHeightStep, mobileWidgetGap, type WidgetViewport, type WidgetSize } from './widgetSize';
import { Button } from '@jae-labs/ui';
import { StatCard } from '../ui/StatCard';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../lib/i18n';
import { irelandMarketChartIds } from '../../lib/irelandMarket';
const IrelandMarketChart = React.lazy(() => import('./IrelandMarketChart').then((module) => ({ default: module.IrelandMarketChart })));

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
  'companies',
  'high-fit-opportunities',
  'saved-jobs',
  'pipeline-progress',
  'application-pipeline',
  'category-breakdown',
  'relevance-distribution',
  'skills-radar',
  ...irelandMarketChartIds,
] as const;

type OverviewWidgetId = typeof overviewWidgetIds[number];
const summaryWidgetIds: readonly OverviewWidgetId[] = overviewWidgetIds.slice(0, 5);

function loadWidgetOrder(storageKey: string | null): OverviewWidgetId[] {
  if (!storageKey) return [...overviewWidgetIds];
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(stored)) return [...overviewWidgetIds];
    const known = stored.filter((id): id is OverviewWidgetId => overviewWidgetIds.includes(id));
    const order = [...new Set(known)];
    if (!order.includes('companies')) {
      order.splice(order.indexOf('tracked-opportunities') + 1, 0, 'companies');
    }
    const complete = [...order, ...overviewWidgetIds.filter((id) => !order.includes(id))];
    // Apply the new default placement once; later drag choices remain untouched.
    if (window.localStorage.getItem(`${storageKey}:revision`) !== '2') {
      return [
        ...complete.filter((id) => summaryWidgetIds.includes(id)),
        'application-pipeline',
        ...complete.filter((id) => !summaryWidgetIds.includes(id) && id !== 'application-pipeline'),
      ];
    }
    return complete;
  } catch {
    return [...overviewWidgetIds];
  }
}


interface OverviewViewProps {
  headerActions?: HTMLElement | null;
  viewport?: WidgetViewport;
  userId?: string;
  overviewMetrics?: OverviewMetrics;
  onNavigateToJobs: (filters?: {
    status?: 'all' | JobFilterStatus;
    sector?: string;
    minMatch?: number;
    q?: string;
  }) => void;
}

const OverviewViewComponent: React.FC<OverviewViewProps> = ({
  userId,
  viewport = 'desktop',
  headerActions,
  overviewMetrics,
  onNavigateToJobs,
}) => {
  const { t } = useTranslation();
  const storageKey = userId ? `jobpulse:overview-widget-order:${userId}${viewport === 'mobile' ? ':mobile' : ''}` : null;
  const [overviewWidgetOrder, setOverviewWidgetOrder] = useState<OverviewWidgetId[]>(() => loadWidgetOrder(storageKey));

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(overviewWidgetOrder));
      window.localStorage.setItem(`${storageKey}:revision`, '2');
    } catch {
      // Storage may be disabled; the current layout still works in memory.
    }
  }, [overviewWidgetOrder, storageKey]);

  const sizeStorageKey = userId ? `jobpulse:overview-widget-sizes:${userId}${viewport === 'mobile' ? ':mobile' : ''}` : null;
  const [widgetSizes, setWidgetSizes] = useState(() => readWidgetSizes(sizeStorageKey, overviewWidgetIds, viewport));
  useEffect(() => {
    if (!sizeStorageKey) return;
    try { window.localStorage.setItem(sizeStorageKey, JSON.stringify(widgetSizes)); }
    catch { /* Keep resizing available when browser storage is disabled. */ }
  }, [sizeStorageKey, widgetSizes]);
  const handleWidgetResize = useCallback((id: string, size: WidgetSize | undefined) => {
    setWidgetSizes((current) => {
      const updated = { ...current };
      if (size) updated[id] = size; else delete updated[id];
      return updated;
    });
  }, []);

  const handleResetWidgets = () => {
    setOverviewWidgetOrder([...overviewWidgetIds]);
    setWidgetSizes({});
  };

  const layoutChanged = overviewWidgetOrder.some((id, index) => id !== overviewWidgetIds[index]) || Object.keys(widgetSizes).length > 0;
  const snapDrag: Modifier = ({ transform, active, activeNodeRect }) => {
    if (!activeNodeRect || !active) return transform;
    const columns = widgetSizes[String(active.id)]?.columns ??
      (summaryWidgetIds.includes(active.id as OverviewWidgetId) ? viewport === 'mobile' ? 10 : 4 : window.matchMedia('(min-width: 1280px)').matches ? 10 : 20);
    const unit = viewport === 'desktop' ? (activeNodeRect.width + 16) / columns : (activeNodeRect.width + mobileWidgetGap) / (columns >= 20 ? 2 : 1);
    return { ...transform, x: Math.round(transform.x / unit) * unit, y: Math.round(transform.y / widgetHeightStep) * widgetHeightStep };
  };
  const resetButton = layoutChanged ? <Button type="button" variant="quiet" size="xs"
    title={t('overview.resetWidgetsDescription')} onClick={handleResetWidgets}>
    {t('overview.resetWidgets')}
  </Button> : null;

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

  const counts = overviewMetrics?.counts ?? {};
  const highMatchCount = overviewMetrics?.high_fit ?? 0;
  const totalOpportunitiesCount = overviewMetrics?.total ?? 0;

  const handleNavigateTracked = useCallback(() => {
    onNavigateToJobs({ status: 'all', sector: 'all', minMatch: 0 });
  }, [onNavigateToJobs]);

  const handleNavigateHighFit = useCallback(() => {
    onNavigateToJobs({ status: 'all', sector: 'all', minMatch: 75 });
  }, [onNavigateToJobs]);

  const handleNavigatePipeline = useCallback(() => {
    onNavigateToJobs({ status: 'applied', sector: 'all', minMatch: 0 });
  }, [onNavigateToJobs]);

  const handleSelectCategory = useCallback((sector: string) => {
    onNavigateToJobs({ status: 'all', sector: sector, minMatch: 0 });
  }, [onNavigateToJobs]);

  const handleSelectStatus = useCallback((status: JobFilterStatus) => {
    onNavigateToJobs({ status, sector: 'all', minMatch: 0 });
  }, [onNavigateToJobs]);

  const handleSelectTier = useCallback((minMatch: number) => {
    onNavigateToJobs({ status: 'all', sector: 'all', minMatch });
  }, [onNavigateToJobs]);

  const handleSelectSkill = useCallback((skill: string) => {
    onNavigateToJobs({ status: 'all', sector: 'all', minMatch: 0, q: skill });
  }, [onNavigateToJobs]);

  const renderOverviewWidgetContent = (widgetId: OverviewWidgetId) => {
    switch (widgetId) {
      case 'ireland-labour-chart':
      case 'ireland-pay-chart':
      case 'ireland-permits-chart':
        return <IrelandMarketChart id={widgetId} />;
      case 'tracked-opportunities':
        return (

            <StatCard
              title={t('overview.trackedOpportunities')}
              value={totalOpportunitiesCount}
              icon={Briefcase}
              onClick={handleNavigateTracked}
            />

        );

      case 'companies':
        return (

            <StatCard
              title={t('overview.companies')}
              value={overviewMetrics?.companies === undefined ? '—' : formatNumber(overviewMetrics.companies)}
              icon={Building2}
            />

        );

      case 'high-fit-opportunities':
        return (

            <StatCard
              title={t('overview.highFitMatches')}
              value={highMatchCount}
              icon={Sparkles}
              onClick={handleNavigateHighFit}
            />

        );

      case 'pipeline-progress':
        return (

            <StatCard
              title={t('overview.inActivePipeline')}
              value={(counts.applied || 0) + (counts.interviewing || 0)}
              icon={Send}
              onClick={handleNavigatePipeline}
            />

        );

      case 'saved-jobs':
        return (

            <StatCard title={t('status.saved')} value={counts.saved || 0} icon={Star} onClick={() => handleSelectStatus('saved')} />

        );

      case 'category-breakdown':
        return (

            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadCategoryChart')}>
              <CategoryBreakdownChart
                title={t('overview.categoryBreakdown')}
                categories={overviewMetrics?.categories ?? []}
                totalJobs={overviewMetrics?.total}
                onSelectCategory={handleSelectCategory}
              />
            </ErrorBoundary>

        );

      case 'application-pipeline':
        return (

            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadPipelineChart')}>
              <PipelineChart
                counts={counts}
                stageAverages={overviewMetrics?.stage_averages ?? {}}
                onSelectStatus={handleSelectStatus}
              />
            </ErrorBoundary>

        );

      case 'relevance-distribution':
        return (

            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadRelevanceChart')}>
              <RelevanceDistributionChart
                distribution={overviewMetrics?.relevance_distribution ?? []}
                onSelectTier={handleSelectTier}
              />
            </ErrorBoundary>

        );

      case 'skills-radar':
        return (

            <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadSkillsChart')}>
              <SkillsFrequencyChart
                topSkills={overviewMetrics?.top_skills ?? []}
                onSelectSkill={handleSelectSkill}
              />
            </ErrorBoundary>

        );
    }
  };

  return (
    <>
      {headerActions ? createPortal(resetButton, headerActions) : resetButton && <div className="fixed right-4 top-2 z-30">{resetButton}</div>}
    <DndContext
      sensors={sensors}
      modifiers={[snapDrag]}
      collisionDetection={closestCenter}
      onDragEnd={handleWidgetDragEnd}
    >
      <SortableContext
        items={overviewWidgetOrder}
        strategy={rectSortingStrategy}
      >
        <div className="bento-grid overview-grid">
          <React.Suspense
            fallback={
              <div className="col-span-full p-8 text-center text-xs text-ds-text-muted">
                <RefreshCw className="size-4 animate-spin inline mr-2 text-ds-text-muted" />
                {t('common.loadingWidgets')}
              </div>
            }
          >
            {overviewWidgetOrder.map((widgetId) => {
              const titleKey = {
                'tracked-opportunities': 'overview.trackedOpportunities',
                companies: 'overview.companies',
                'high-fit-opportunities': 'overview.highFitMatches',
                'pipeline-progress': 'overview.inActivePipeline',
                'saved-jobs': 'status.saved',
                'application-pipeline': 'charts.pipeline.title',
                'category-breakdown': 'overview.categoryBreakdown',
                'relevance-distribution': 'overview.relevanceDistribution',
                'skills-radar': 'charts.skills.title',
                'ireland-labour-chart': 'overview.ireland.charts.ireland-labour-chart',
                'ireland-pay-chart': 'overview.ireland.charts.ireland-pay-chart',
                'ireland-permits-chart': 'overview.ireland.charts.ireland-permits-chart',
              }[widgetId];
              const title = t(titleKey);
              const stat = summaryWidgetIds.includes(widgetId);
              return <SortableWidget key={widgetId} id={widgetId}
                reorderLabel={t('common.reorder', { item: title })}
                resizeLabel={t('common.resize', { item: title })}
                resizeInstructions={t('common.resizeWidgetHelp')}
                className={stat ? 'overview-widget-stat' : 'overview-widget-chart'}
                viewport={viewport}
                minHeight={viewport === 'mobile' ? stat ? 148 : 348 : stat ? 104 : 320}
                size={widgetSizes[widgetId]} onResize={handleWidgetResize}>
                {renderOverviewWidgetContent(widgetId)}
              </SortableWidget>;
            })}
          </React.Suspense>
        </div>
      </SortableContext>
    </DndContext>
    </>
  );
};

const desktopQuery = '(min-width: 768px)';
function subscribeViewport(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
function getDesktopViewport() { return window.matchMedia(desktopQuery).matches; }

export const OverviewView = React.memo(function OverviewView(props: OverviewViewProps) {
  const desktop = useSyncExternalStore(subscribeViewport, getDesktopViewport, () => true);
  const viewport = desktop ? 'desktop' : 'mobile';
  return <OverviewViewComponent {...props} key={`${props.userId ?? 'anonymous'}:${viewport}`} viewport={viewport} />;
});
