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
import { WidgetCard } from '@jae-labs/ui';

export interface RelevanceTier {
  range: string;
  min?: number;
  max?: number;
  count: number;
}

interface RelevanceDistributionChartProps {
  distribution: RelevanceTier[];
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
        className={`bg-ds-panel border border-ds-border-strong p-3.5 rounded-ds-card shadow-ds-overlay text-xs space-y-1.5 z-50 select-none ${
          onSelectTier ? 'cursor-pointer' : ''
        }`}
        onClick={() => onSelectTier?.(minMatch)}
      >
        <div className="font-semibold text-ds-text-primary">{t('charts.relevance.tier', { label })}</div>
        <div className="flex items-center gap-2 text-ds-text-secondary">
          <span className="size-2 rounded-full inline-block bg-ds-positive" />
          <span>{positionText}</span>
        </div>
      </div>
    );
  }
  return null;
};

import { getCachedCssVar } from '../../lib/chartTheme';

const RelevanceDistributionChartComponent: React.FC<RelevanceDistributionChartProps> = ({
  distribution,
  onSelectTier,
}) => {
  const { t } = useTranslation();

  const chartColors = React.useMemo(() => ({
    positive: getCachedCssVar('--ds-color-chart-3') || getCachedCssVar('--ds-color-positive') || 'currentColor',
    axis: getCachedCssVar('--ds-color-chart-axis'),
    grid: getCachedCssVar('--ds-color-chart-grid'),
    text: getCachedCssVar('--ds-color-text-primary'),
    muted: getCachedCssVar('--ds-color-text-muted'),
    border: getCachedCssVar('--ds-color-border-strong')
  }), []);

  const data = distribution;

  return (
    <WidgetCard title={t('charts.relevance.title')}>
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
              isAnimationActive={false}
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
    </WidgetCard>
  );
};

export const RelevanceDistributionChart = React.memo(RelevanceDistributionChartComponent);
