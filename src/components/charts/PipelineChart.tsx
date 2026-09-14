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
import { Card, Pill, type PillVariant } from '../../design-system';
import { formatNumber } from '../../lib/i18n';

interface PipelineChartProps {
  jobs?: Job[];
  counts?: Record<string, number>;
  onSelectStatus?: (status: JobStatus) => void;
}

const STAGE_CONFIG: Record<
  JobStatus,
  { label: string; color: string; variant: PillVariant }
> = {
  new: {
    label: 'New',
    color: 'var(--ds-color-status-new)',
    variant: 'status-new',
  },
  applied: {
    label: 'Applied',
    color: 'var(--ds-color-status-applied)',
    variant: 'status-applied',
  },
  interviewing: {
    label: 'Interview',
    color: 'var(--ds-color-status-interviewing)',
    variant: 'status-interviewing',
  },
  interested: {
    label: 'Interested',
    color: 'var(--ds-color-status-interested)',
    variant: 'status-interested',
  },
  not_interested: {
    label: 'Not Interested',
    color: 'var(--ds-color-status-muted)',
    variant: 'status-muted',
  },
};

const CustomTooltip = ({ active, payload, label, onSelectStatus }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="bg-ds-panel border border-ds-border-strong p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 cursor-pointer z-50"
        onClick={() => onSelectStatus?.(data.status)}
      >
        <div className="font-semibold text-ds-text-primary">{label} Stage</div>
        <div className="flex items-center gap-2 text-ds-text-secondary">
          <span
            className="size-2 rounded-full inline-block shrink-0"
            style={{ backgroundColor: data.fill }}
          />
          <span>{data.count} {data.count === 1 ? 'role' : 'roles'}</span>
        </div>
        <div className="text-[11px] text-ds-text-muted pt-1 border-t border-ds-border flex items-center gap-1 font-medium">
          <span>Click to view {label.toLowerCase()} roles →</span>
        </div>
      </div>
    );
  }
  return null;
};

export const PipelineChart: React.FC<PipelineChartProps> = ({ jobs = [], counts, onSelectStatus }) => {
  const { t, i18n } = useTranslation();
  const data = React.useMemo(() => {
    const keys: JobStatus[] = ['new', 'applied', 'interviewing', 'interested', 'not_interested'];
    return keys.map((status) => {
      const config = STAGE_CONFIG[status];
      const count = counts ? (counts[status] || 0) : jobs.filter((j) => j.status === status).length;
      return {
        status,
        name: t(`status.${status}` as any) || config.label,
        count,
        fill: config.color,
      };
    });
  }, [jobs, counts, t]);

  const renderCustomTick = (tickProps: any) => {
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
          <h3 className="text-sm font-medium text-ds-text-secondary tracking-wide">
            {t('charts.pipeline.title')}
          </h3>
          <p className="text-xs text-ds-text-muted mt-0.5">
            {t('charts.pipeline.subtitle')}
          </p>
        </div>
      </div>

      <div className="h-60 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            onClick={(state: any) => {
              if (state && state.activePayload && state.activePayload.length) {
                const clicked = state.activePayload[0]?.payload?.status;
                if (clicked) onSelectStatus?.(clicked);
              } else if (state && state.activeLabel) {
                const found = data.find((d) => d.name === state.activeLabel);
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
              content={<CustomTooltip onSelectStatus={onSelectStatus} />}
              cursor={{ fill: 'var(--ds-color-hover)', opacity: 0.5 }}
            />
            <Bar
              dataKey="count"
              radius={[8, 8, 0, 0]}
              activeBar={{
                stroke: 'var(--ds-color-text-primary)',
                strokeWidth: 1.5,
                fillOpacity: 1,
              }}
              onClick={(entry: any) => {
                const status = entry?.status || entry?.payload?.status;
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
          const config = STAGE_CONFIG[stage.status];
          return (
            <Pill
              key={stage.status}
              layout="spread"
              variant={config?.variant || 'neutral'}
              label={stage.name}
              count={formatNumber(stage.count, i18n.language)}
              onClick={() => onSelectStatus?.(stage.status)}
              title={`View ${stage.name} roles`}
            />
          );
        })}
      </div>
    </Card>
  );
};
