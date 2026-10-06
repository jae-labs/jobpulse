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
import { WidgetCard } from '@jae-labs/ui';

export interface SkillFrequencyItem {
  skill: string;
  count: number;
  percentage: number;
}

interface SkillsFrequencyChartProps {
  topSkills: SkillFrequencyItem[];
  onSelectSkill?: (skill: string) => void;
}

interface SkillDataPoint {
  skill: string;
  count: number;
  percentage: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SkillDataPoint }>;
  label?: string;
  onSelectSkill?: (skill: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const CustomTooltip = ({ active, payload, label, onSelectSkill, t }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const skillName = data.skill || label || '';
    return (
      <div
        className={`bg-ds-panel border border-ds-border-strong p-3.5 rounded-ds-card shadow-ds-overlay text-xs space-y-1.5 z-50 ${
          onSelectSkill ? 'cursor-pointer' : ''
        }`}
        onClick={() => onSelectSkill?.(skillName)}
      >
        <div className="font-semibold text-ds-text-primary capitalize">{label}</div>
        <div className="flex items-center gap-2 text-ds-text-secondary">
          <span className="size-2 rounded-full inline-block bg-ds-positive" />
          <span>{t('charts.skills.presentIn', { count: data.count, percentage: data.percentage })}</span>
        </div>
      </div>
    );
  }
  return null;
};

import { getCachedCssVar } from '../../lib/chartTheme';

const SkillsFrequencyChartComponent: React.FC<SkillsFrequencyChartProps> = ({
  topSkills,
  onSelectSkill,
}) => {
  const { t } = useTranslation();

  const chartColors = React.useMemo(() => ({
    positive: getCachedCssVar('--ds-color-chart-3') || getCachedCssVar('--ds-color-positive') || 'currentColor',
    secondary: getCachedCssVar('--ds-color-chart-2') || getCachedCssVar('--ds-color-accent') || 'currentColor',
    axis: getCachedCssVar('--ds-color-chart-axis'),
    grid: getCachedCssVar('--ds-color-chart-grid'),
    text: getCachedCssVar('--ds-color-text-primary'),
    muted: getCachedCssVar('--ds-color-text-muted'),
    hover: getCachedCssVar('--ds-color-hover')
  }), []);

  const data = topSkills;

  return (
    <WidgetCard title={t('charts.skills.title')}>
      <div className="widget-plot h-64 w-full">
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
              isAnimationActive={false}
              radius={[0, 6, 6, 0]}
              activeBar={{
                stroke: chartColors.text,
                strokeWidth: 1.5,
                fillOpacity: 1,
              }}
              onClick={(entry: unknown) => {
                const item = entry as Partial<SkillDataPoint> & { payload?: SkillDataPoint };
                const skill = item?.skill || item?.payload?.skill;
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
    </WidgetCard>
  );
};

export const SkillsFrequencyChart = React.memo(SkillsFrequencyChartComponent);
