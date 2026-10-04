import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { WidgetCard, Button } from '@jae-labs/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../lib/i18n';
import { getCachedCssVar } from '../../lib/chartTheme';
import { irelandMarket as market, irelandMarketHistory, type IrelandMarketChartId } from '../../lib/irelandMarket';

interface Series { key: string; label: string; color: string; dash?: string }
interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; payload?: Record<string, number | string> }>;
  series: Series[];
  format: (value: number) => string;
}
function ChartTooltip({ active, payload, label, series, format }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (!row) return null;
  return <div className="rounded-ds-card border border-ds-border-strong bg-ds-panel p-3 text-xs shadow-lg">
    <p className="mb-2 font-medium text-ds-text-primary">{label}</p>
    {series.map((item) => <p key={item.key} className="flex justify-between gap-4 text-ds-text-secondary">
      <span>{item.label}</span><span className="tabular-nums text-ds-text-primary">{format(Number(row[`raw_${item.key}`]))}</span>
    </p>)}
  </div>;
}

export const IrelandMarketChart = memo(function IrelandMarketChart({ id }: { id: IrelandMarketChartId }) {
  const { t, i18n } = useTranslation();
  const [annual, setAnnual] = useState(true);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !plotRef.current?.contains(event.target)) {
        setTooltipDismissed(true);
      }
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, []);
  const history = irelandMarketHistory;
  const labour = id === 'ireland-labour-chart';
  const colors = useMemo(() => ({
    first: getCachedCssVar('--ds-color-chart-1', 'var(--ds-color-chart-1)'),
    second: getCachedCssVar('--ds-color-chart-2', 'var(--ds-color-chart-2)'),
    third: getCachedCssVar('--ds-color-chart-3', 'var(--ds-color-chart-3)'),
    grid: getCachedCssVar('--ds-color-chart-grid', 'var(--ds-color-border)'),
    axis: getCachedCssVar('--ds-color-text-muted', 'var(--ds-color-text-muted)'),
  }), []);
  const series: Series[] = labour ? [
    { key: 'labourForce', label: t('overview.ireland.labourForceSeries'), color: colors.first },
    { key: 'unemployed', label: t('overview.ireland.peopleUnemployed'), color: colors.second, dash: '6 3' },
    { key: 'vacancies', label: t('overview.ireland.vacancySeries'), color: colors.third, dash: '2 3' },
  ] : [
    { key: 'minimum', label: t('overview.ireland.minimumWageSeries'), color: colors.second, dash: '6 3' },
    { key: 'mean', label: t(annual ? 'overview.ireland.meanAnnualSeries' : 'overview.ireland.meanHourly'), color: colors.first },
  ];
  const format = (value: number) => formatNumber(value, i18n.language, labour ? undefined : {
    style: 'currency', currency: 'EUR', minimumFractionDigits: annual ? 0 : 2, maximumFractionDigits: annual ? 0 : 2,
  });
  const data = history.map((point) => {
    const raw = labour ? {
      labourForce: point.labourForce, unemployed: point.unemployed, vacancies: point.vacancies,
    } : {
      minimum: annual ? point.minimumHourly * market.minimumWageHoursPerWeek * market.weeksPerYear : point.minimumHourly,
      mean: annual ? point.meanWeekly * market.weeksPerYear : point.meanHourly,
    };
    const row: Record<string, number | string> = { period: point.period };
    for (const [key, value] of Object.entries(raw)) {
      if (value === undefined) continue;
      row[key] = value;
      row[`raw_${key}`] = value;
    }
    return row;
  });
  const sources = labour ? [
    { name: t('overview.ireland.labourSource'), href: market.sources.labourHistory },
    { name: t('overview.ireland.vacancySource'), href: market.sources.vacanciesHistory },
  ] : [
    { name: 'CSO', href: market.sources.earningsHistory },
    { name: t('overview.ireland.wageHistorySource'), href: market.sources.wageHistory },
    { name: '2025–2026', href: market.sources.wage2025 },
  ];

  return <WidgetCard title={t(`overview.ireland.charts.${id}`)}>
    {!labour && <div className="flex flex-wrap gap-1" role="group" aria-label={t('overview.ireland.payBasis')}>
      <Button size="sm" variant={annual ? 'secondary' : 'ghost'} aria-pressed={annual} onClick={() => setAnnual(true)}>{t('overview.ireland.annual')}</Button>
      <Button size="sm" variant={annual ? 'ghost' : 'secondary'} aria-pressed={!annual} onClick={() => setAnnual(false)}>{t('overview.ireland.hourlyBasis')}</Button>
    </div>}
    <div>
    <div ref={plotRef} className="h-60 min-w-0 w-full"
      onPointerDownCapture={() => setTooltipDismissed(false)}
      onPointerEnter={() => setTooltipDismissed(false)}
      onFocusCapture={() => setTooltipDismissed(false)}
      onBlurCapture={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTooltipDismissed(true);
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') setTooltipDismissed(true);
        else if (event.key.startsWith('Arrow')) setTooltipDismissed(false);
      }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tickFormatter={(period: string) => period.slice(-4)} minTickGap={16} interval="preserveStartEnd" stroke={colors.axis} tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} />
          <YAxis width={52} stroke={colors.axis} tick={{ fontSize: 10, fill: colors.axis }} tickLine={false} axisLine={false}
            domain={[0, 'auto']}
            tickFormatter={(value: number) => formatNumber(value, i18n.language, { notation: 'compact', maximumFractionDigits: 1, ...(!labour ? { style: 'currency', currency: 'EUR' } : {}) })} />
          <Tooltip active={tooltipDismissed ? false : undefined} isAnimationActive={false} content={<ChartTooltip series={series} format={format} />} />
          {series.map((item) => <Line key={item.key} type="linear" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} strokeDasharray={item.dash} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    </div>
    <ul aria-label={t('overview.ireland.legend')} className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-ds-text-secondary">
      {series.map((item) => <li key={item.key} className="flex items-center gap-1.5">
        <svg aria-hidden="true" width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} /></svg>{item.label}
      </li>)}
    </ul>
    <div className="mt-auto flex flex-wrap gap-3 border-t border-ds-border pt-2.5 text-[11px] text-ds-text-secondary">
      {sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer" className="rounded-ds-control hover:text-ds-accent ds-focus-ring">
        {source.name}<span className="sr-only"> ({t('common.opensInNewWindow')})</span>
      </a>)}
    </div>
  </WidgetCard>;
});
