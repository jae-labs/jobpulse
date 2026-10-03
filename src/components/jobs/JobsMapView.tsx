import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './JobsMapView.css';
import { Button, Select } from '@jae-labs/ui';
import type { JobMapPin, JobsPageParams } from '../../types/job';
import { useJobMapQuery, useJobMapPreviewQuery } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';
import JobsMapLocationPanel from './JobsMapLocationPanel';
import JobsMapCanvas, { pinKey } from './JobsMapCanvas';

const NO_PINS: JobMapPin[] = [];
export default function JobsMapView({ userId, filters, onSelectJob, onSelectLocation }: {
  userId?: string | null;
  filters: JobsPageParams;
  onSelectJob: (id: number) => void;
  onSelectLocation?: (location: string) => void;
}) {
  const section = useRef<HTMLElement>(null);
  const { t, i18n } = useTranslation();
  const [viewport, setViewport] = useState({ bounds: [-10.8, 51.3, -5.3, 55.5], zoom: 7 });
  const query = useJobMapQuery(userId, filters, viewport.bounds, viewport.zoom);
  const [selectedPin, setSelectedPin] = useState<JobMapPin | null>(null);
  const scope = JSON.stringify([userId, filters]);
  useEffect(() => { setSelectedPin(null); }, [scope]);
  const pins = query.isError ? NO_PINS : query.data?.pins;
  const previews = useJobMapPreviewQuery(userId, onSelectLocation && selectedPin ? selectedPin.job_ids : []);
  useEffect(() => {
    if (!onSelectLocation || !selectedPin || query.isError || previews.isError || previews.isPending) return;
    const places = [...new Set((previews.data ?? []).map((job) => job.location))];
    // A zoomed-out group can span several places: let the user choose instead of guessing.
    if (places.length === 1 && places[0] && places[0].length <= 80) onSelectLocation(places[0]);
  }, [onSelectLocation, selectedPin, query.isError, previews.data, previews.isError, previews.isPending]);


  return <section ref={section} className="flex min-h-0 flex-1 flex-col gap-2" aria-label={t('jobs.layoutMapTitle')}>
    {query.isPending || query.isFetching || query.isError || query.data?.truncated ? <div className="flex min-h-5 flex-wrap items-center gap-2 text-xs text-ds-text-secondary" aria-live="polite">
      {query.isPending || query.isFetching ? <span>{t('jobs.mapLoading')}</span> : null}
      {query.isError ? <><span role="alert">{t('jobs.mapError')}</span><Button variant="secondary" onClick={() => void query.refetch()}>{t('common.retry')}</Button></> : null}
      {!query.isError && query.data?.truncated ? <span>{t('jobs.mapZoomMore')}</span> : null}
    </div> : null}
    <Select aria-label={t('jobs.mapChooseGroup')} value={selectedPin ? pinKey(selectedPin) : ''} disabled={!pins?.length}
      className="max-w-full text-xs sm:max-w-md" onChange={(event) => setSelectedPin(pins?.find((pin) => pinKey(pin) === event.target.value) ?? null)}>
      <option value="">{t('jobs.mapChooseGroup')}</option>
      {(pins ?? []).map((pin) => <option key={pinKey(pin)} value={pinKey(pin)}>{t('jobs.mapGroupLabel', { count: pin.count, countLabel: formatNumber(pin.count, i18n.language), company: pin.company, role: pin.title })}</option>)}
    </Select>
    <div className={`job-map-workspace ${selectedPin && !query.isError ? 'has-selection' : ''}`}>
      <JobsMapCanvas scope={scope} pins={pins} selectedPin={selectedPin} onSelectPin={setSelectedPin} onViewport={setViewport} />
      {selectedPin && !query.isError ? <JobsMapLocationPanel key={selectedPin.job_ids.join(',')} pin={selectedPin} userId={userId} filters={filters} onSelectJob={onSelectJob} onSelectLocation={onSelectLocation} onClose={() => { setSelectedPin(null); section.current?.querySelector<HTMLSelectElement>('select')?.focus(); }} /> : null}
    </div>
  </section>;
}
