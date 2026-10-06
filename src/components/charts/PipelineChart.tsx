import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { JobStatus } from '../../types/job';
import { WidgetCard, Pill } from '@jae-labs/ui';
import { formatNumber } from '../../lib/i18n';
import { statusPillTone } from '../../lib/statusTone';

interface PipelineChartProps {
  counts: Record<string, number>;
  stageAverages: Record<string, number>;
  onSelectStatus?: (status: JobStatus) => void;
}

const STAGE_CONFIG: Record<
  JobStatus,
  { token: string; fallback: string }
> = {
  new: {
    token: '--jp-color-status-new',
    fallback: 'currentColor',
  },
  applied: {
    token: '--jp-color-status-applied',
    fallback: 'currentColor',
  },
  interviewing: {
    token: '--jp-color-status-interviewing',
    fallback: 'currentColor',
  },
  rejected: {
    token: '--jp-color-status-rejected',
    fallback: 'currentColor',
  },
  not_interested: {
    token: '--jp-color-status-muted',
    fallback: 'currentColor',
  },
};

interface PipelineDataPoint {
  status: JobStatus;
  name: string;
  fullName?: string;
  count: number;
  avgMatch: number | null;
  fill: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PipelineDataPoint }>;
  label?: string;
  onSelectStatus?: (status: JobStatus) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const CustomTooltip = ({ active, payload, label, onSelectStatus, t }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const roleText = data.count === 1 ? t('charts.pipeline.role') : t('charts.pipeline.roles');
    return (
      <div
        className="bg-ds-panel border border-ds-border-strong p-3.5 rounded-ds-card shadow-ds-overlay text-xs space-y-1.5 cursor-pointer z-50"
        onClick={() => onSelectStatus?.(data.status)}
      >
        <div className="font-semibold text-ds-text-primary">{data.fullName || label}</div>
        <div className="flex items-center gap-2 text-ds-text-secondary">
          <span
            className="size-2 rounded-full inline-block shrink-0"
            style={{ backgroundColor: data.fill }}
          />
          <span>{data.count} {roleText}</span>
        </div>
        {data.avgMatch !== null && (
          <div className="flex justify-between gap-4 text-ds-text-secondary">
            <span>{t('charts.categoryBreakdown.averageMatchLabel')}</span>
            <span className="font-semibold text-ds-text-primary">{data.avgMatch}%</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

import { getCachedCssVar } from '../../lib/chartTheme';

const PipelineChartComponent: React.FC<PipelineChartProps> = ({ counts, stageAverages, onSelectStatus }) => {
  const { t, i18n } = useTranslation();
  const data = React.useMemo(() => {
    const keys: JobStatus[] = ['new', 'applied', 'interviewing', 'rejected'];

    return keys.map((status) => {
      const config = STAGE_CONFIG[status];
      const count = counts[status] || 0;
      const suppliedAverage = stageAverages?.[status];
      const avgMatch = count === 0
        ? null
        : typeof suppliedAverage === 'number' && Number.isFinite(suppliedAverage)
          ? Math.round(suppliedAverage)
          : null;

      const colorValue = getCachedCssVar(config.token, config.fallback);

      return {
        status,
        name: t(`status.short.${status}`, { defaultValue: t(`status.${status}`) }),
        fullName: t(`status.${status}`),
        count,
        avgMatch,
        fill: colorValue,
      };
    });
  }, [counts, stageAverages, t]);

  const renderCustomTick = (tickProps: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const { x = 0, y = 0, payload } = tickProps;
    const stage = data.find((d) => d.name === payload?.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={14}
          textAnchor="middle"
          fill="var(--ds-color-text-muted)"
          fontSize={10}
          className="cursor-pointer hover:fill-ds-text-primary ds-motion-control select-none font-medium text-xs"
          onClick={(e) => {
            e.stopPropagation();
            if (stage) onSelectStatus?.(stage.status);
          }}
        >
          {payload?.value}
        </text>
      </g>
    );
  };

  return (
    <WidgetCard title={t('charts.pipeline.title')}>
      <div className="widget-plot h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            onClick={(state: { activePayload?: Array<{ payload?: PipelineDataPoint }>; activeLabel?: string | number } | null) => {
              if (state && state.activePayload && state.activePayload.length) {
                const clicked = state.activePayload[0]?.payload?.status;
                if (clicked) onSelectStatus?.(clicked);
              } else if (state && state.activeLabel !== undefined) {
                const found = data.find((d) => d.name === String(state.activeLabel));
                if (found) onSelectStatus?.(found.status);
              }
            }}
          >
            <CartesianGrid
              stroke="var(--ds-color-chart-grid)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              stroke="var(--ds-color-chart-axis)"
              tick={renderCustomTick}
              tickLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              stroke="var(--ds-color-chart-axis)"
              tick={{ fill: 'var(--ds-color-text-muted)', fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip onSelectStatus={onSelectStatus} t={t} />}
              cursor={{ fill: 'var(--ds-color-hover)', opacity: 0.5 }}
            />
            <Bar
              dataKey="count"
              isAnimationActive={false}
              radius={[8, 8, 0, 0]}
              activeBar={{
                stroke: 'var(--ds-color-text-primary)',
                strokeWidth: 1.5,
                fillOpacity: 1,
              }}
              onClick={(entry: unknown) => {
                const item = entry as Partial<PipelineDataPoint> & { payload?: PipelineDataPoint };
                const status = item?.status || item?.payload?.status;
                if (status) onSelectStatus?.(status);
              }}
              className="cursor-pointer"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.fill}
                  className="cursor-pointer hover:opacity-80 ds-motion-control"
                  onClick={() => onSelectStatus?.(entry.status)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-ds-border">
        {data.map((stage) => {
          return (
            <Pill
              key={stage.status}
              className="h-auto min-h-12 flex-col items-stretch justify-center gap-0.5"
              tone={statusPillTone[stage.status]}
              onClick={() => onSelectStatus?.(stage.status)}
            >
              <span className="flex items-center justify-between gap-1.5">
                <span className="truncate">{stage.fullName || stage.name}</span>
                <span className="shrink-0 font-mono text-xs font-semibold opacity-80">{formatNumber(stage.count, i18n.language)}</span>
              </span>
              {stage.avgMatch !== null && (
                <span className="text-xs opacity-80">{t('charts.pipeline.averageMatchShort', { value: formatNumber(stage.avgMatch, i18n.language) })}</span>
              )}
            </Pill>
          );
        })}
      </div>
    </WidgetCard>
  );
};

export const PipelineChart = React.memo(PipelineChartComponent);
