import React, { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { OverviewCategory } from '../../types/job';
import { WidgetCard, Pill } from '@jae-labs/ui';
import { formatNumber } from '../../lib/i18n';
import { getSectorLabel } from '../../lib/sectors';

interface CategoryBreakdownChartProps {
  title?: string;
  categories: OverviewCategory[];
  totalJobs?: number;
  onSelectCategory?: (category: string) => void;
}

const CHART_TONES = [
  'chart-1', 'chart-2', 'chart-3', 'chart-4',
  'chart-5', 'chart-6', 'chart-7', 'chart-8',
] as const;

import { getCachedCssVar } from '../../lib/chartTheme';

function getCategoryColorIndex(name: string, fallbackIndex: number): number {
  if (!name) return fallbackIndex % CHART_TONES.length;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % CHART_TONES.length;
}

interface CategoryDataPoint {
  name: string;
  label: string;
  value: number;
  percentage: number;
  avgMatch: number;
  fill: string;
  tone: (typeof CHART_TONES)[number];
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
        className={`bg-ds-panel border border-ds-border-strong p-3.5 rounded-ds-card shadow-ds-overlay text-xs space-y-1.5 min-w-[200px] z-50 ${
          onSelectCategory ? 'cursor-pointer' : 'pointer-events-none'
        }`}
        onClick={() => onSelectCategory?.(data.name)}
      >
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full inline-block shrink-0"
            style={{ backgroundColor: data.fill }}
          />
          <span className="font-semibold text-ds-text-primary truncate">{data.label}</span>
        </div>
        <div className="text-ds-text-secondary flex justify-between gap-4 pt-1.5 border-t border-ds-border">
          <span>{t('charts.categoryBreakdown.opportunitiesLabel')}</span>
          <span className="font-bold text-ds-text-primary">{data.value} ({data.percentage}%)</span>
        </div>
        <div className="text-ds-text-secondary flex justify-between gap-4">
          <span>{t('charts.categoryBreakdown.averageMatchLabel')}</span>
          <span className="font-bold text-ds-text-primary font-mono">{data.avgMatch}%</span>
        </div>
      </div>
    );
  }
  return null;
};

const CategoryBreakdownChartComponent: React.FC<CategoryBreakdownChartProps> = ({
  title,
  categories,
  totalJobs: controlledTotalJobs,
  onSelectCategory,
}) => {
  const { t, i18n } = useTranslation();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const palette = useMemo(
    () => CHART_TONES.map((tone) => {
      const token = `--ds-color-${tone}`;
      return getCachedCssVar(token, `var(${token})`);
    }),
    []
  );

  const { chartData, topCategory } = useMemo(() => {
    const totalCount = controlledTotalJobs ?? (categories.reduce((sum, category) => sum + category.value, 0) || 1);
    const data = categories.map((category, index) => {
      const colorIndex = getCategoryColorIndex(category.name, index);
      return {
        ...category,
        label: getSectorLabel(category.name, t),
        percentage: Number(((category.value / (totalCount || 1)) * 100).toFixed(1)),
        fill: palette[colorIndex],
        tone: CHART_TONES[colorIndex],
      };
    });
    return { chartData: data, topCategory: data[0] };
  }, [categories, controlledTotalJobs, palette, t]);

  const activeIdx = hoveredIdx ?? selectedIdx;
  const activeCategory = activeIdx !== null ? chartData[activeIdx] : topCategory;

  return (
    <WidgetCard title={title ?? t('charts.categoryBreakdown.title')}>
      <div className="widget-plot h-64 w-full relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={<CustomTooltip t={t} onSelectCategory={onSelectCategory} />}
              wrapperStyle={{ zIndex: 100, outline: 'none' }}
            />
            <Pie
              data={chartData}
              isAnimationActive={false}
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
                  className="ds-motion-control"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* The selected category remains visible after pointer hover ends. */}
        {activeCategory && (
          <button
            type="button"
            aria-label={activeCategory.label}
            onClick={() => onSelectCategory?.(activeCategory.name)}
            className={`absolute z-0 max-w-[140px] px-4 text-center rounded-ds-control ds-motion-control ds-focus-ring ${
              onSelectCategory ? 'cursor-pointer hover:scale-105 active:scale-95' : 'pointer-events-none'
            }`}
          >
            <div className="text-xs uppercase font-semibold text-ds-text-secondary truncate">
              {activeCategory.label}
            </div>
            <div className="text-xl font-bold text-ds-text-primary">
              {formatNumber(activeCategory.value, i18n.language)}
            </div>
            <div className="text-xs text-ds-text-secondary font-semibold font-mono">
              {activeCategory.percentage}%
            </div>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2 border-t border-ds-border">
        {chartData.map((cat, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <Pill
              key={cat.name}
              layout="spread"
              tone={cat.tone}
              label={cat.label}
              count={formatNumber(cat.value, i18n.language)}
              active={isSelected}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => {
                setSelectedIdx((prev) => (prev === idx ? null : idx));
                if (cat.name) onSelectCategory?.(cat.name);
              }}
              title={cat.label}
            />
          );
        })}
      </div>
    </WidgetCard>
  );
};

export const CategoryBreakdownChart = React.memo(CategoryBreakdownChartComponent);
