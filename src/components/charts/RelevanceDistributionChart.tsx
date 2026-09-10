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

export interface RelevanceTier {
  range: string;
  min?: number;
  max?: number;
  count: number;
}

interface RelevanceDistributionChartProps {
  jobs?: Job[];
  distribution?: RelevanceTier[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#16171b] border border-white/[0.12] p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 z-50">
        <div className="font-semibold text-white">Match Tier: {label}</div>
        <div className="flex items-center gap-2 text-neutral-300">
          <span className="size-2 rounded-full inline-block bg-emerald-400" />
          <span>{data.count} {data.count === 1 ? 'position' : 'positions'}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const RelevanceDistributionChart: React.FC<RelevanceDistributionChartProps> = ({ jobs = [], distribution }) => {
  const { t } = useTranslation();
  const data = React.useMemo(() => {
    if (distribution && distribution.length > 0) {
      return distribution;
    }
    const buckets = [
      { range: '90-100%', min: 90, max: 100 },
      { range: '80-89%', min: 80, max: 89 },
      { range: '70-79%', min: 70, max: 79 },
      { range: '60-69%', min: 60, max: 69 },
      { range: '<60%', min: 0, max: 59 },
    ];

    return buckets.map((b) => ({
      range: b.range,
      count: jobs.filter((j) => j.relevance >= b.min && j.relevance <= b.max).length,
    }));
  }, [jobs, distribution]);

  return (
    <div className="surface-panel rounded-3xl p-6 border border-white/10 flex flex-col justify-between">
      <div className="mb-4">
        <h3 className="text-base font-bold text-white tracking-tight">{t('charts.relevance.title')}</h3>
        <p className="text-xs text-neutral-400 mt-1">{t('charts.relevance.subtitle')}</p>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="relevanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="rgba(255, 255, 255, 0.05)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="range"
              stroke="rgba(255, 255, 255, 0.2)"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              stroke="rgba(255, 255, 255, 0.2)"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#relevanceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
