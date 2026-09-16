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
import { Card } from '../../design-system';

export interface SkillFrequencyItem {
  skill: string;
  count: number;
  percentage: number;
}

interface SkillsFrequencyChartProps {
  jobs?: Job[];
  topSkills?: SkillFrequencyItem[];
  onSelectSkill?: (skill: string) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  onSelectSkill?: (skill: string) => void;
  t: (key: string, options?: any) => string;
}

const CustomTooltip = ({ active, payload, label, onSelectSkill, t }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const skillName = data.skill || label;
    return (
      <div
        className={`bg-ds-panel border border-ds-border-strong p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 z-50 ${
          onSelectSkill ? 'cursor-pointer' : ''
        }`}
        onClick={() => onSelectSkill?.(skillName)}
      >
        <div className="font-semibold text-ds-text-primary capitalize">{label}</div>
        <div className="flex items-center gap-2 text-ds-text-secondary">
          <span className="size-2 rounded-full inline-block bg-ds-positive" />
          <span>{t('charts.skills.presentIn', { count: data.count, percentage: data.percentage })}</span>
        </div>
        {onSelectSkill && (
          <div className="text-[11px] text-ds-text-muted pt-1 border-t border-ds-border flex items-center gap-1 font-medium">
            <span>{t('charts.skills.clickToView', { skill: label })}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const getCssVar = (name: string) =>
  typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';

export const SkillsFrequencyChart: React.FC<SkillsFrequencyChartProps> = ({
  jobs = [],
  topSkills,
  onSelectSkill,
}) => {
  const { t } = useTranslation();

  const chartColors = React.useMemo(() => ({
    positive: getCssVar('--ds-chart-3') || '#34d399',
    secondary: getCssVar('--ds-chart-2') || '#a78bfa',
    axis: getCssVar('--ds-color-chart-axis'),
    grid: getCssVar('--ds-color-chart-grid'),
    text: getCssVar('--ds-color-text-primary'),
    muted: getCssVar('--ds-color-text-muted'),
    hover: getCssVar('--ds-color-hover')
  }), []);

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
    <Card className="p-6 lg:p-7 relative overflow-hidden flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-ds-text-secondary tracking-wide">
            {t('charts.skills.title')}
          </h3>
          <p className="text-xs text-ds-text-muted mt-0.5">
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
              stroke={chartColors.grid}
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke={chartColors.axis}
              tick={{ fill: chartColors.muted, fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="skill"
              stroke={chartColors.axis}
              tick={{ fill: chartColors.muted, fontSize: 11 }}
              tickLine={false}
              width={110}
            />
            <Tooltip
              content={<CustomTooltip onSelectSkill={onSelectSkill} t={t} />}
              cursor={{ fill: chartColors.hover, opacity: 0.5 }}
              wrapperStyle={{ outline: 'none' }}
            />
            <Bar
              dataKey="count"
              radius={[0, 6, 6, 0]}
              activeBar={{
                stroke: chartColors.text,
                strokeWidth: 1.5,
                fillOpacity: 1,
              }}
              onClick={(entry: any) => {
                const skill = entry?.skill || entry?.payload?.skill;
                if (skill) onSelectSkill?.(skill);
              }}
              className={onSelectSkill ? 'cursor-pointer' : undefined}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? chartColors.positive : chartColors.secondary}
                  fillOpacity={0.85 - index * 0.1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
