import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { Job } from '../../types/job';
import { Card } from '../../design-system';

export interface RelevanceTier {
  range: string;
  min?: number;
  max?: number;
  count: number;
}

interface RelevanceDistributionChartProps {
  jobs?: Job[];
  distribution?: RelevanceTier[];
  onSelectTier?: (minMatch: number) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RelevanceTier }>;
  label?: string;
  onSelectTier?: (minMatch: number) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, onSelectTier, t }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const minMatch = typeof data.min === 'number' ? data.min : 0;
    const positionText = data.count === 1
      ? t('charts.relevance.position', { count: data.count })
      : t('charts.relevance.positions', { count: data.count });
    return (
      <div
        className={`bg-ds-panel border border-ds-border-strong p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 z-50 select-none ${
          onSelectTier ? 'cursor-pointer' : ''
        }`}
        onClick={() => onSelectTier?.(minMatch)}
      >
        <div className="font-semibold text-ds-text-primary">{t('charts.relevance.tier', { label })}</div>
        <div className="flex items-center gap-2 text-ds-text-secondary">
          <span className="size-2 rounded-full inline-block bg-ds-positive" />
          <span>{positionText}</span>
        </div>
        {onSelectTier && (
          <div className="text-[11px] text-ds-text-muted pt-1 border-t border-ds-border flex items-center gap-1 font-medium">
            <span>{t('charts.relevance.clickToView', { label })}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const getCssVar = (name: string) =>
  typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';

export const RelevanceDistributionChart: React.FC<RelevanceDistributionChartProps> = ({
  jobs = [],
  distribution,
  onSelectTier,
}) => {
  const { t } = useTranslation();

  const chartColors = React.useMemo(() => ({
    positive: getCssVar('--ds-chart-3') || getCssVar('--ds-color-positive') || 'currentColor',
    axis: getCssVar('--ds-color-chart-axis'),
    grid: getCssVar('--ds-color-chart-grid'),
    text: getCssVar('--ds-color-text-primary'),
    muted: getCssVar('--ds-color-text-muted'),
    border: getCssVar('--ds-color-border-strong')
  }), []);

  const data = React.useMemo(() => {
    if (distribution && distribution.length > 0) {
      return distribution;
    }
    const buckets = [
      { range: '90-100%', min: 90, max: 100 },
      { range: '80-89%', min: 80, max: 89 },
      { range: '70-79%', min: 70, max: 79 },
      { range: '60-69%', min: 60, max: 69 },
      { range: '50-59%', min: 50, max: 59 },
      { range: '40-49%', min: 40, max: 49 },
      { range: '30-39%', min: 30, max: 39 },
      { range: '20-29%', min: 20, max: 29 },
      { range: '10-19%', min: 10, max: 19 },
      { range: '0-9%', min: 0, max: 9 },
    ];

    return buckets.map((b) => ({
      range: b.range,
      min: b.min,
      max: b.max,
      count: jobs.filter((j) => j.relevance >= b.min && j.relevance <= b.max).length,
    }));
  }, [jobs, distribution]);

  return (
    <Card className="rounded-3xl p-6 flex flex-col justify-between">
      <div className="mb-4">
        <h3 className="text-base font-bold text-ds-text-primary tracking-tight">{t('charts.relevance.title')}</h3>
        <p className="text-xs text-ds-text-muted mt-1">{t('charts.relevance.subtitle')}</p>
      </div>

      <div className={`h-64 w-full ${onSelectTier ? 'cursor-pointer' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            onClick={(e: { activePayload?: Array<{ payload?: RelevanceTier }>; activeLabel?: string | number; activeTooltipIndex?: unknown } | null) => {
              const tier = e?.activePayload?.[0]?.payload;
              if (tier && typeof tier.min === 'number') {
                onSelectTier?.(tier.min);
                return;
              }
              if (e?.activeLabel !== undefined) {
                const found = data.find((d) => d.range === String(e.activeLabel));
                if (found && typeof found.min === 'number') {
                  onSelectTier?.(found.min);
                  return;
                }
              }
              if (typeof e?.activeTooltipIndex === 'number' && data[e.activeTooltipIndex]) {
                const found = data[e.activeTooltipIndex];
                if (typeof found.min === 'number') {
                  onSelectTier?.(found.min);
                  return;
                }
              }
            }}
            className={onSelectTier ? 'cursor-pointer' : undefined}
          >
            <defs>
              <linearGradient id="relevanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.positive} stopOpacity={0.4} />
                <stop offset="95%" stopColor={chartColors.positive} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke={chartColors.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="range"
              stroke={chartColors.axis}
              tick={{ fill: chartColors.muted, fontSize: 10 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              stroke={chartColors.axis}
              tick={{ fill: chartColors.muted, fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip onSelectTier={onSelectTier} t={t} />}
              cursor={{ stroke: chartColors.border, strokeDasharray: '3 3' }}
              wrapperStyle={{ outline: 'none' }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={chartColors.positive}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#relevanceGradient)"
              dot={{ r: 2.5, fill: chartColors.positive, strokeWidth: 0, cursor: onSelectTier ? 'pointer' : undefined }}
              activeDot={{
                r: 5,
                fill: chartColors.positive,
                stroke: chartColors.text,
                strokeWidth: 2,
                cursor: onSelectTier ? 'pointer' : undefined,
              }}
              onClick={(entry: unknown) => {
                const item = entry as { payload?: RelevanceTier } & Partial<RelevanceTier>;
                const tier = item?.payload || item;
                if (tier && typeof tier.min === 'number') {
                  onSelectTier?.(tier.min);
                }
              }}
              className={onSelectTier ? 'cursor-pointer' : undefined}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
