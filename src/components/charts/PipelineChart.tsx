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

interface PipelineChartProps {
  jobs?: Job[];
  counts?: Record<string, number>;
  onSelectStatus?: (status: JobStatus) => void;
}

const STAGE_CONFIG: Record<JobStatus, { label: string; color: string }> = {
  new: { label: 'New', color: '#38bdf8' },
  applied: { label: 'Applied', color: '#10b981' },
  interviewing: { label: 'Interview', color: '#a855f7' },
  interested: { label: 'Interested', color: '#ec4899' },
  not_interested: { label: 'Not Interested', color: '#71717a' },
};

const CustomTooltip = ({ active, payload, label, onSelectStatus }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="bg-[#16171b] border border-white/[0.12] p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 cursor-pointer z-50"
        onClick={() => onSelectStatus?.(data.status)}
      >
        <div className="font-semibold text-white">{label} Stage</div>
        <div className="flex items-center gap-2 text-neutral-300">
          <span
            className="size-2 rounded-full inline-block shrink-0"
            style={{ backgroundColor: data.fill }}
          />
          <span>{data.count} {data.count === 1 ? 'role' : 'roles'}</span>
        </div>
        <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800 flex items-center gap-1 font-medium">
          <span>Click to view {label.toLowerCase()} roles →</span>
        </div>
      </div>
    );
  }
  return null;
};

export const PipelineChart: React.FC<PipelineChartProps> = ({ jobs = [], counts, onSelectStatus }) => {
  const { t } = useTranslation();
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
          fill="#a1a1aa"
          fontSize={11}
          className="cursor-pointer hover:fill-zinc-100 transition-colors select-none font-medium"
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
    <div className="surface-panel p-6 lg:p-7 rounded-3xl relative overflow-hidden flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutral-300 tracking-wide">
            {t('charts.pipeline.title')}
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
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
              stroke="rgba(255, 255, 255, 0.05)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              stroke="rgba(255, 255, 255, 0.2)"
              tick={renderCustomTick}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              stroke="rgba(255, 255, 255, 0.2)"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip onSelectStatus={onSelectStatus} />} />
            <Bar
              dataKey="count"
              radius={[8, 8, 0, 0]}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-zinc-800">
        {data.map((stage) => (
          <button
            key={stage.status}
            type="button"
            onClick={() => onSelectStatus?.(stage.status)}
            className="group flex items-center justify-between gap-2 p-2 rounded-xl text-left transition-all text-xs border border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 hover:text-white cursor-pointer"
            title={`View ${stage.name} roles`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="size-2 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                style={{ backgroundColor: stage.fill }}
              />
              <span className="truncate text-[11px] font-medium">
                {stage.name}
              </span>
            </div>
            <span className="font-mono text-[10px] text-zinc-400 group-hover:text-zinc-100 shrink-0 font-semibold">
              {stage.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
