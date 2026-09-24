import React, { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { Job, OverviewCategory } from '../../types/job';
import { Card, Pill } from '../../design-system';
import { formatNumber } from '../../lib/i18n';

interface CategoryBreakdownChartProps {
  jobs?: Job[];
  categories?: OverviewCategory[];
  totalJobs?: number;
  onSelectCategory?: (category: string) => void;
}

const CHART_FALLBACK_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#fb923c',
  '#60a5fa',
  '#facc15',
  '#818cf8',
];

const getCssVar = (name: string, fallback: string = ''): string =>
  typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback : fallback;

function getCategoryColor(name: string, palette: string[], fallbackIndex: number): string {
  if (!name) return palette[fallbackIndex % palette.length];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

interface CategoryDataPoint {
  name: string;
  value: number;
  percentage: number;
  avgMatch: number;
  fill: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CategoryDataPoint }>;
  t: (key: string, options?: Record<string, unknown>) => string;
  onSelectCategory?: (category: string) => void;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, t, onSelectCategory }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className={`bg-ds-panel border border-ds-border-strong p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[200px] z-50 ${
          onSelectCategory ? 'cursor-pointer' : 'pointer-events-none'
        }`}
        onClick={() => onSelectCategory?.(data.name)}
      >
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full inline-block shrink-0"
            style={{ backgroundColor: data.fill }}
          />
          <span className="font-semibold text-ds-text-primary truncate">{data.name}</span>
        </div>
        <div className="text-ds-text-secondary flex justify-between gap-4 pt-1.5 border-t border-ds-border">
          <span>{t('charts.categoryBreakdown.opportunitiesLabel')}</span>
          <span className="font-bold text-ds-text-primary">{data.value} ({data.percentage}%)</span>
        </div>
        <div className="text-ds-text-secondary flex justify-between gap-4">
          <span>{t('charts.categoryBreakdown.averageMatchLabel')}</span>
          <span className="font-bold text-ds-text-primary font-mono">{data.avgMatch}%</span>
        </div>
        {onSelectCategory && (
          <div className="text-[11px] text-ds-text-muted pt-1 border-t border-ds-border flex items-center gap-1 font-medium">
            <span>{t('charts.categoryBreakdown.clickToView', { name: data.name })}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export const CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = ({
  jobs = [],
  categories,
  totalJobs: controlledTotalJobs,
  onSelectCategory,
}) => {
  const { t, i18n } = useTranslation();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const palette = useMemo(() => [
    getCssVar('--ds-chart-1', CHART_FALLBACK_COLORS[0]),
    getCssVar('--ds-chart-2', CHART_FALLBACK_COLORS[1]),
    getCssVar('--ds-chart-3', CHART_FALLBACK_COLORS[2]),
    getCssVar('--ds-chart-4', CHART_FALLBACK_COLORS[3]),
    getCssVar('--ds-chart-5', CHART_FALLBACK_COLORS[4]),
    getCssVar('--ds-chart-6', CHART_FALLBACK_COLORS[5]),
    getCssVar('--ds-chart-7', CHART_FALLBACK_COLORS[6]),
    getCssVar('--ds-chart-8', CHART_FALLBACK_COLORS[7]),
  ], []);

  const { chartData, topCategory, totalCategories } = useMemo(() => {
    if (categories && categories.length > 0) {
      const totalCount = controlledTotalJobs || categories.reduce((sum, c) => sum + c.value, 0) || 1;
      const sorted = categories.map((cat, idx) => {
        const color = getCategoryColor(cat.name, palette, idx);
        const percentage = ((cat.value / totalCount) * 100).toFixed(1);
        return {
          name: cat.name,
          value: cat.value,
          percentage,
          avgMatch: cat.avgMatch,
          fill: color,
        };
      });
      return {
        chartData: sorted,
        topCategory: sorted[0],
        totalCategories: sorted.length,
      };
    }

    const categoryMap = new Map<string, { count: number; totalScore: number }>();

    for (const job of jobs) {
      const cat = (job.role_domain || 'General Administration').trim();
      const existing = categoryMap.get(cat) || { count: 0, totalScore: 0 };
      categoryMap.set(cat, {
        count: existing.count + 1,
        totalScore: existing.totalScore + (job.relevance || 0),
      });
    }

    const totalJobs = jobs.length || 1;
    const sorted = Array.from(categoryMap.entries())
      .map(([name, stats], idx) => {
        const color = getCategoryColor(name, palette, idx);
        const percentage = ((stats.count / totalJobs) * 100).toFixed(1);
        const avgMatch = Math.round(stats.totalScore / stats.count);
        return {
          name,
          value: stats.count,
          percentage,
          avgMatch,
          fill: color,
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      chartData: sorted,
      topCategory: sorted[0],
      totalCategories: sorted.length,
    };
  }, [jobs, categories, controlledTotalJobs, palette]);

  const activeIdx = hoveredIdx ?? selectedIdx;
  const activeCategory = activeIdx !== null ? chartData[activeIdx] : topCategory;

  return (
    <Card className="p-6 lg:p-7 flex flex-col justify-between space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-ds-text-primary">
            {t('charts.categoryBreakdown.title')}
          </h3>
          <p className="text-xs text-ds-text-muted mt-0.5">
            {t('charts.categoryBreakdown.subtitle', { count: totalCategories })}
          </p>
        </div>
      </div>

      {/* Donut Chart with Center Highlight */}
      <div className="h-[260px] w-full relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={<CustomTooltip t={t} onSelectCategory={onSelectCategory} />}
              wrapperStyle={{ zIndex: 100, outline: 'none' }}
            />
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={105}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, index) => setHoveredIdx(index)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={(_, index) => {
                setSelectedIdx(index);
                const cat = chartData[index];
                if (cat?.name) onSelectCategory?.(cat.name);
              }}
              cursor="pointer"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.fill}
                  opacity={activeIdx === null || activeIdx === index ? 1 : 0.4}
                  stroke={activeIdx === index ? 'var(--ds-color-text-primary)' : 'transparent'}
                  strokeWidth={2}
                  className="transition-all duration-200"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* The selected category remains visible after pointer hover ends. */}
        {activeCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory?.(activeCategory.name)}
            className={`absolute z-0 max-w-[140px] px-4 text-center rounded-xl transition-transform ${
              onSelectCategory ? 'cursor-pointer hover:scale-105 active:scale-95' : 'pointer-events-none'
            }`}
            title={onSelectCategory ? `View ${activeCategory.name} opportunities` : undefined}
          >
            <div className="text-[10px] uppercase font-semibold text-ds-text-secondary truncate">
              {activeCategory.name}
            </div>
            <div className="text-xl font-bold text-ds-text-primary">
              {activeCategory.value}
            </div>
            <div className="text-xs text-ds-text-secondary font-semibold font-mono">
              {activeCategory.percentage}%
            </div>
          </button>
        )}
      </div>

      {/* Interactive Category Legend Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2 border-t border-ds-border">
        {chartData.slice(0, 8).map((cat, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <Pill
              key={cat.name}
              layout="spread"
              color={cat.fill}
              label={cat.name}
              count={formatNumber(cat.value, i18n.language)}
              active={isSelected}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => {
                setSelectedIdx((prev) => (prev === idx ? null : idx));
                if (cat.name) onSelectCategory?.(cat.name);
              }}
              title={cat.name}
            />
          );
        })}
      </div>
    </Card>
  );
};
