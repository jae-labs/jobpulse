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
import type { Job, JobStatus } from '../../types/job';
import { Card, Pill } from '@jae-labs/ui';
import { formatNumber } from '../../lib/i18n';
import { statusPillTone } from '../../lib/statusTone';

interface PipelineChartProps {
  jobs?: Job[];
  counts?: Record<string, number>;
  stageAverages?: Record<string, number>;
  onSelectStatus?: (status: JobStatus) => void;
}

const STAGE_CONFIG: Record<
  JobStatus,
  { token: string; fallback: string }
> = {
  new: {
    token: '--jp-color-status-new',
    fallback: '#3b82f6',
  },
  applied: {
    token: '--jp-color-status-applied',
    fallback: '#8b5cf6',
  },
  interviewing: {
    token: '--jp-color-status-interviewing',
    fallback: '#f59e0b',
  },
  interested: {
    token: '--jp-color-status-interested',
    fallback: '#10b981',
  },
  not_interested: {
    token: '--jp-color-status-muted',
    fallback: '#6b7280',
  },
};

interface PipelineDataPoint {
  status: JobStatus;
  name: string;
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
        className="bg-ds-panel border border-ds-border-strong p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 cursor-pointer z-50"
        onClick={() => onSelectStatus?.(data.status)}
      >
        <div className="font-semibold text-ds-text-primary">{label}</div>
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

const PipelineChartComponent: React.FC<PipelineChartProps> = ({ jobs = [], counts, stageAverages, onSelectStatus }) => {
  const { t, i18n } = useTranslation();
  const data = React.useMemo(() => {
    const keys: JobStatus[] = ['new', 'applied', 'interviewing', 'interested', 'not_interested'];

    const stats: Record<JobStatus, { count: number; totalScore: number }> = {
      new: { count: 0, totalScore: 0 },
      applied: { count: 0, totalScore: 0 },
      interviewing: { count: 0, totalScore: 0 },
      interested: { count: 0, totalScore: 0 },
      not_interested: { count: 0, totalScore: 0 },
    };

    if (!counts || !stageAverages) {
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const s = stats[j.status];
        if (s) {
          s.count++;
          s.totalScore += j.relevance || 0;
        }
      }
    }

    return keys.map((status) => {
      const config = STAGE_CONFIG[status];
      const count = counts ? (counts[status] || 0) : stats[status].count;
      const suppliedAverage = stageAverages?.[status];
      const avgMatch = count === 0
        ? null
        : typeof suppliedAverage === 'number' && Number.isFinite(suppliedAverage)
          ? Math.round(suppliedAverage)
          : stats[status].count > 0
            ? Math.round(stats[status].totalScore / stats[status].count)
            : null;

      const colorValue = getCachedCssVar(config.token, config.fallback);

      return {
        status,
        name: t(`status.${status}`),
        count,
        avgMatch,
        fill: colorValue,
      };
    });
  }, [jobs, counts, stageAverages, t]);

  const renderCustomTick = (tickProps: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const { x, y, payload } = tickProps;
    const stage = data.find((d) => d.name === payload?.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={14}
          textAnchor="middle"
          fill="var(--ds-color-text-muted)"
          fontSize={11}
          className="cursor-pointer hover:fill-ds-text-primary transition-colors select-none font-medium"
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
    <Card className="p-6 lg:p-7 relative overflow-hidden flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-ds-text-primary">
            {t('charts.pipeline.title')}
          </h3>
        </div>
      </div>

      <div className="h-60 w-full pt-2">
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
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => onSelectStatus?.(entry.status)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive Status Stages Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-ds-border">
        {data.map((stage) => {
          return (
            <Pill
              key={stage.status}
              className="h-auto min-h-12 flex-col items-stretch justify-center gap-0.5 rounded-xl py-1.5"
              tone={statusPillTone[stage.status]}
              onClick={() => onSelectStatus?.(stage.status)}
            >
              <span className="flex items-center justify-between gap-1.5">
                <span className="truncate">{stage.name}</span>
                <span className="shrink-0 font-mono text-[10px] font-semibold opacity-80">{formatNumber(stage.count, i18n.language)}</span>
              </span>
              {stage.avgMatch !== null && (
                <span className="text-[10px] opacity-80">{t('charts.pipeline.averageMatchShort', { value: formatNumber(stage.avgMatch, i18n.language) })}</span>
              )}
            </Pill>
          );
        })}
      </div>
    </Card>
  );
};

export const PipelineChart = React.memo(PipelineChartComponent);
