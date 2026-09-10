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
import type { Job } from '../../types/job';

export interface SkillFrequencyItem {
  skill: string;
  count: number;
  percentage: number;
}

interface SkillsFrequencyChartProps {
  jobs?: Job[];
  topSkills?: SkillFrequencyItem[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#16171b] border border-white/[0.12] p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 z-50">
        <div className="font-semibold text-white capitalize">{label}</div>
        <div className="flex items-center gap-2 text-neutral-300">
          <span className="size-2 rounded-full inline-block bg-emerald-400" />
          <span>Present in {data.count} roles ({data.percentage}%)</span>
        </div>
      </div>
    );
  }
  return null;
};

export const SkillsFrequencyChart: React.FC<SkillsFrequencyChartProps> = ({ jobs = [], topSkills }) => {
  const { t } = useTranslation();
  const data = React.useMemo(() => {
    if (topSkills && topSkills.length > 0) {
      return topSkills;
    }
    const frequencyMap: Record<string, number> = {};
    for (const job of jobs) {
      for (const skill of job.matched_skills || []) {
        const normalized = skill.toLowerCase().trim();
        frequencyMap[normalized] = (frequencyMap[normalized] || 0) + 1;
      }
    }

    const total = jobs.length || 1;
    return Object.entries(frequencyMap)
      .map(([skill, count]) => ({
        skill,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [jobs, topSkills]);

  return (
    <div className="surface-panel p-6 lg:p-7 rounded-3xl relative overflow-hidden flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutral-300 tracking-wide">
            {t('charts.skills.title')}
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            {t('charts.skills.subtitle')}
          </p>
        </div>
      </div>

      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
          >
            <CartesianGrid
              stroke="rgba(255, 255, 255, 0.05)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke="rgba(255, 255, 255, 0.2)"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="skill"
              stroke="rgba(255, 255, 255, 0.2)"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={false}
              width={110}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? '#10b981' : index === 1 ? '#34d399' : '#6ee7b7'}
                  fillOpacity={0.85 - index * 0.1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
