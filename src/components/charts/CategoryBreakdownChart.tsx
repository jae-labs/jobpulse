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

interface CategoryBreakdownChartProps {
  jobs?: Job[];
  categories?: OverviewCategory[];
  totalJobs?: number;
  onSelectCategory?: (category: string) => void;
}

const DOMAIN_COLOR_PALETTE: Record<string, string> = {
  'General Administration': '#f59e0b', // Amber
  'Academic Administration & Higher Education': '#ec4899', // Pink
  'Public Service & Governance Operations': '#10b981', // Emerald
  'Operations & Institutional Administration': '#8b5cf6', // Purple
  'Software, IT & Cybersecurity': '#38bdf8', // Sky
  'Engineering & Architecture': '#06b6d4', // Cyan
  'Corporate Directors & C-Suite': '#f43f5e', // Rose
  'Healthcare & Clinical': '#14b8a6', // Teal
  'Finance, Accounting & Tax': '#84cc16', // Lime
  'Aviation Operations': '#6366f1', // Indigo
  'Hospitality, Catering & Facilities': '#d97706', // Warm Orange
  'Academic Faculty & Professorship': '#a855f7', // Violet
  'Scientific & Ecological': '#22c55e', // Bright Green
  'Emergency Services & Armed Defence': '#ef4444', // Red
  'Direct Sales Quotas': '#f97316', // Orange
  'Compliance & Legal Analysis': '#3b82f6', // Blue
};

const FALLBACK_COLORS = [
  '#38bdf8', '#ec4899', '#10b981', '#8b5cf6', '#a855f7', '#06b6d4',
  '#f43f5e', '#14b8a6', '#84cc16', '#6366f1', '#f97316', '#71717a',
];

const CustomTooltip = ({ active, payload, t }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#16171b] border border-white/[0.12] p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[200px] z-50 pointer-events-none">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full inline-block shrink-0"
            style={{ backgroundColor: data.fill }}
          />
          <span className="font-semibold text-white truncate">{data.name}</span>
        </div>
        <div className="text-zinc-300 flex justify-between gap-4 pt-1.5 border-t border-zinc-800">
          <span>{t('charts.categoryBreakdown.opportunitiesLabel')}</span>
          <span className="font-bold text-white">{data.value} ({data.percentage}%)</span>
        </div>
        <div className="text-zinc-300 flex justify-between gap-4">
          <span>{t('charts.categoryBreakdown.averageMatchLabel')}</span>
          <span className="font-bold text-zinc-100 font-mono">{data.avgMatch}%</span>
        </div>
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
  const { t } = useTranslation();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

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

  const activeCategory = hoveredIdx !== null ? chartData[hoveredIdx] : topCategory;

  return (
    <div className="surface-panel p-6 lg:p-7 rounded-3xl flex flex-col justify-between space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-white">
            {t('charts.categoryBreakdown.title')}
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            {t('charts.categoryBreakdown.subtitle', { count: totalCategories })}
          </p>
        </div>
      </div>

      {/* Donut Chart with Center Highlight */}
      <div className="h-[260px] w-full relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip t={t} />} wrapperStyle={{ zIndex: 100, pointerEvents: 'none', outline: 'none' }} />
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
              onClick={(entry) => onSelectCategory?.(entry.name)}
              cursor={onSelectCategory ? 'pointer' : 'default'}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.fill}
                  opacity={hoveredIdx === null || hoveredIdx === index ? 1 : 0.4}
                  stroke={hoveredIdx === index ? '#ffffff' : 'transparent'}
                  strokeWidth={2}
                  className="transition-all duration-200"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label inside donut - fades out cleanly when hovering a slice */}
        {activeCategory && (
          <div
            className={`absolute pointer-events-none text-center px-4 max-w-[140px] z-0 transition-opacity duration-150 ${
              hoveredIdx !== null ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="text-[10px] uppercase font-semibold text-neutral-300 truncate">
              {activeCategory.name}
            </div>
            <div className="text-xl font-bold text-white">
              {activeCategory.value}
            </div>
            <div className="text-xs text-zinc-300 font-semibold font-mono">
              {activeCategory.percentage}%
            </div>
          </div>
        )}
      </div>

      {/* Interactive Category Legend Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2 border-t border-white/10">
        {chartData.slice(0, 8).map((cat, idx) => {
          const isSelected = hoveredIdx === idx;
          return (
            <button
              key={cat.name}
              type="button"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectCategory?.(cat.name)}
              className={`flex items-center justify-between gap-2 p-2 rounded-xl text-left transition-all text-xs border ${
                isSelected
                  ? 'border-purple-500/50 bg-purple-500/15 text-white shadow-sm ring-1 ring-purple-500/30'
                  : 'border-white/10 bg-white/[0.04] text-neutral-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: cat.fill }}
                />
                <span className="truncate text-[11px] font-medium" title={cat.name}>
                  {cat.name}
                </span>
              </div>
              <span className="font-mono text-[10px] text-neutral-300 shrink-0 font-semibold">
                {cat.value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
