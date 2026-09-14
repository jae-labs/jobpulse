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

const DOMAIN_COLOR_PALETTE: Record<string, string> = {
  'General Administration': 'var(--ds-color-data-5)',
  'Academic Administration & Higher Education': 'var(--ds-color-data-4)',
  'Public Service & Governance Operations': 'var(--ds-color-data-2)',
  'Operations & Institutional Administration': 'var(--ds-color-data-12)',
  'Software, IT & Cybersecurity': 'var(--ds-color-data-1)',
  'Engineering & Architecture': 'var(--ds-color-data-6)',
  'Corporate Directors & C-Suite': 'var(--ds-color-data-7)',
  'Healthcare & Clinical': 'var(--ds-color-data-8)',
  'Finance, Accounting & Tax': 'var(--ds-color-data-9)',
  'Aviation Operations': 'var(--ds-color-data-10)',
  'Hospitality, Catering & Facilities': 'var(--ds-color-data-11)',
  'Academic Faculty & Professorship': 'var(--ds-color-data-12)',
  'Scientific & Ecological': 'var(--ds-color-data-13)',
  'Emergency Services & Armed Defence': 'var(--ds-color-data-14)',
  'Direct Sales Quotas': 'var(--ds-color-data-15)',
  'Compliance & Legal Analysis': 'var(--ds-color-data-16)',
};

const FALLBACK_COLORS = [
  'var(--ds-color-data-1)', 'var(--ds-color-data-4)', 'var(--ds-color-data-2)', 'var(--ds-color-data-12)',
  'var(--ds-color-data-6)', 'var(--ds-color-data-7)', 'var(--ds-color-data-8)', 'var(--ds-color-data-9)',
  'var(--ds-color-data-10)', 'var(--ds-color-data-11)', 'var(--ds-color-data-15)', 'var(--ds-color-status-muted)',
];

const CustomTooltip = ({ active, payload, t, onSelectCategory }: any) => {
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

  const { chartData, topCategory, totalCategories } = useMemo(() => {
    if (categories && categories.length > 0) {
      const totalCount = controlledTotalJobs || categories.reduce((sum, c) => sum + c.value, 0) || 1;
      const sorted = categories.map((cat, idx) => {
        const color = DOMAIN_COLOR_PALETTE[cat.name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
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
        const color = DOMAIN_COLOR_PALETTE[name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
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
  }, [jobs, categories, controlledTotalJobs]);

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
