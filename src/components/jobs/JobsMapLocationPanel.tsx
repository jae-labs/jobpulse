import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@jae-labs/ui';
import { X } from 'lucide-react';
import { useJobMapPreviewQuery, useJobsPageQuery } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';
import type { JobMapPin, JobsPageParams } from '../../types/job';

type Props = {
  pin: JobMapPin;
  userId?: string | null;
  filters: JobsPageParams;
  onSelectJob: (id: number) => void;
  onClose: () => void;
  onSelectLocation?: (location: string) => void;
};

/** A group may contain different places; browse one explicit posting location at a time. */
export default function JobsMapLocationPanel({ pin, userId, filters, onSelectJob, onClose, onSelectLocation }: Props) {
  const { t, i18n } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previews = useJobMapPreviewQuery(userId, pin.job_ids);
  const [location, setLocation] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const page = useJobsPageQuery(userId, { ...filters, location: location ?? 'all', limit: 20, offset }, Boolean(location));
  useEffect(() => { heading.current?.focus(); }, [location]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [location, offset]);
  const locations = [...new Set((previews.data ?? []).map((job) => job.location))].filter((place) => place && place.length <= 80);
  const active = location ? page : previews;
  const jobs = active.isError ? [] : location ? page.data?.items ?? [] : previews.data ?? [];
  return <aside className="job-map-browser rounded-ds-card border border-ds-border bg-ds-panel" aria-label={t('jobs.mapBrowseTitle')}>
    <div className="flex items-start justify-between gap-3 border-b border-ds-border p-3">
      <div>
        <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold text-ds-text-primary">{location ?? t('jobs.mapCluster', { count: pin.count })}</h2>
        <p className="mt-1 text-xs text-ds-text-muted">{t('jobs.mapPrecision', { precision: t(`jobs.locationPrecision.${pin.precision}`, { defaultValue: pin.precision }) })}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('jobs.mapCloseBrowser')}><X className="size-4" /></Button>
    </div>
    <div ref={content} className="job-map-browser-content p-3">
      {active.isPending || active.isFetching ? <p role="status" className="text-xs text-ds-text-muted">{t('jobs.mapLoadingJobs')}</p> : null}
      {active.isError ? <div role="alert"><p>{t('jobs.mapJobsError')}</p><Button variant="secondary" onClick={() => void active.refetch()}>{t('common.retry')}</Button></div> : null}
      {!location && !previews.isError && previews.data ? <>
        <p className="mb-3 text-xs text-ds-text-muted">{t('jobs.mapSampleJobs', { count: previews.data.length, total: formatNumber(pin.count, i18n.language) })}</p>
        <div className="mb-3 flex flex-col gap-2">{locations.map((place) => <Button key={place} variant="secondary" size="sm" onClick={() => { if (onSelectLocation) onSelectLocation(place); else { setLocation(place); setOffset(0); } }}>{t('jobs.mapBrowseLocation', { location: place })}</Button>)}</div>
      </> : null}
      {location && !page.isError && page.data ? <p className="mb-3 text-xs text-ds-text-muted">{t('jobs.mapLocationTotal', { count: page.data.total, countLabel: formatNumber(page.data.total, i18n.language) })}</p> : null}
      <div className="flex flex-col gap-2">{jobs.map((job) => <button key={job.id} type="button" onClick={() => onSelectJob(job.id)} aria-label={t('jobs.mapOpenRole', { role: job.title, company: job.company, location: job.location })} className="job-map-job rounded-ds-control border border-ds-border p-3 text-left hover:bg-ds-hover">
        <span className="block text-sm font-medium text-ds-text-primary">{job.title}</span>
        <span className="mt-1 block text-xs text-ds-text-secondary">{job.company}</span>
        <span className="mt-1 block text-xs text-ds-text-muted">{job.location}</span>
      </button>)}</div>
      {!active.isPending && !active.isError && !jobs.length ? <p className="text-xs text-ds-text-muted">{t('jobs.mapNoJobs')}</p> : null}
    </div>
    {location && !page.isError && page.data ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ds-border p-3">
      <Button variant="secondary" size="sm" disabled={offset === 0 || page.isFetching} onClick={() => setOffset(Math.max(0, offset - 20))}>{t('jobs.mapPrevious')}</Button>
      <span className="text-xs text-ds-text-muted">{formatNumber(Math.floor(offset / 20) + 1, i18n.language)} / {formatNumber(Math.max(1, Math.ceil(page.data.total / 20)), i18n.language)}</span>
      <Button variant="secondary" size="sm" disabled={offset + 20 >= page.data.total || page.isFetching} onClick={() => setOffset(offset + 20)}>{t('jobs.mapNext')}</Button>
    </div> : null}
  </aside>;
}
