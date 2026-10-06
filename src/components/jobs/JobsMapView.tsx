import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './JobsMapView.css';
import { Button, Tooltip } from '@jae-labs/ui';
import { MapPin, Building2 } from 'lucide-react';
import type { JobMapPin, JobsPageParams } from '../../types/job';
import { useJobMapQuery, useJobMapPreviewQuery } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';
import JobsMapLocationPanel from './JobsMapLocationPanel';
import JobsMapCanvas from './JobsMapCanvas';
import { pinKey } from './mapUtils';

const NO_PINS: JobMapPin[] = [];
const WORLD_BOUNDS = [-180, -90, 180, 90];
export default function JobsMapView({ userId, filters, onSelectJob, onSelectLocation }: {
  userId?: string | null;
  filters: JobsPageParams;
  onSelectJob: (id: number) => void;
  onSelectLocation?: (location: string) => void;
}) {
  const section = useRef<HTMLElement>(null);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  const { t, i18n } = useTranslation();
  // Fetch precise location groups once per filter scope; camera movement is local.
  const query = useJobMapQuery(userId, filters, WORLD_BOUNDS, 19);
  const [selectedPin, setSelectedPin] = useState<JobMapPin | null>(null);
  const [officeLayer, setOfficeLayer] = useState(false);
  const scope = JSON.stringify([userId, filters]);
  const [prevScope, setPrevScope] = useState(scope);
  if (scope !== prevScope) {
    setPrevScope(scope);
    setSelectedPin(null);
  }
  const pins = query.isError ? NO_PINS : officeLayer ? query.data?.office_pins ?? NO_PINS : query.data?.pins;
  const truncated = officeLayer ? query.data?.office_truncated : query.data?.truncated;
  const previews = useJobMapPreviewQuery(userId, onSelectLocation && selectedPin ? selectedPin.job_ids : []);
  useEffect(() => {
    if (officeLayer || !onSelectLocation || !selectedPin || query.isError || previews.isError || previews.isPending) return;
    const places = [...new Set((previews.data ?? []).map((job) => job.location))];
    // A coordinate group can contain several posting labels: let the user choose instead of guessing.
    if (places.length === 1 && places[0] && places[0].length <= 80) onSelectLocation(places[0]);
  }, [officeLayer, onSelectLocation, selectedPin, query.isError, previews.data, previews.isError, previews.isPending]);

  return <section ref={section} className="flex min-h-0 flex-1 flex-col gap-2 relative" aria-label={t('jobs.layoutMapTitle')}>
    {query.isError || truncated ? <div className="flex min-h-5 flex-wrap items-center gap-2 text-xs text-ds-text-secondary" aria-live="polite">
      {query.isError ? <><span role="alert">{t('jobs.mapError')}</span><Button variant="secondary" onClick={() => void query.refetch()}>{t('common.retry')}</Button></> : null}
      {!query.isError && truncated ? <span>{t('jobs.mapTooManyLocations')}</span> : null}
    </div> : null}
    <div className={`job-map-workspace ${selectedPin && !query.isError ? 'has-selection' : ''}`}>
      <JobsMapCanvas scope={`${scope}:${officeLayer}`} pins={pins} selectedPin={selectedPin} onSelectPin={(pin) => { selectionTrigger.current = section.current?.querySelector('canvas') ?? null; setSelectedPin(pin); }} />
      <div className="absolute top-2 right-2 z-10 flex items-start gap-2">
        <div className="flex bg-ds-surface/90 backdrop-blur rounded-ds-control border border-ds-border p-1 gap-1">
          <Tooltip label={t('jobs.mapPostingLayer')}>
            <button
              type="button"
              aria-pressed={!officeLayer}
              onClick={() => { setOfficeLayer(false); setSelectedPin(null); }}
              className={`flex size-7 items-center justify-center rounded-ds-control ds-motion-control ${!officeLayer ? 'bg-ds-selected text-ds-text-primary ring-1 ring-ds-border' : 'text-ds-text-muted hover:text-ds-text-primary hover:bg-ds-hover'}`}
            >
              <MapPin className="size-4" strokeWidth={!officeLayer ? 2.5 : 2} />
              <span className="sr-only">{t('jobs.mapPostingLayer')}</span>
            </button>
          </Tooltip>
          <Tooltip label={t('jobs.mapOfficeLayer')}>
            <button
              type="button"
              aria-pressed={officeLayer}
              onClick={() => { setOfficeLayer(true); setSelectedPin(null); }}
              className={`flex size-7 items-center justify-center rounded-ds-control ds-motion-control ${officeLayer ? 'bg-ds-selected text-ds-text-primary ring-1 ring-ds-border' : 'text-ds-text-muted hover:text-ds-text-primary hover:bg-ds-hover'}`}
            >
              <Building2 className="size-4" strokeWidth={officeLayer ? 2.5 : 2} />
              <span className="sr-only">{t('jobs.mapOfficeLayer')}</span>
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:z-10 focus-within:max-h-64 focus-within:overflow-y-auto focus-within:rounded-ds-control focus-within:bg-ds-panel focus-within:p-2">
        {(pins ?? []).map((pin) => <Button key={pinKey(pin)} variant="secondary" size="sm" onClick={(event) => { selectionTrigger.current = event.currentTarget; setSelectedPin(pin); }}>{t('jobs.mapGroupLabel', { count: pin.count, countLabel: formatNumber(pin.count, i18n.language), company: pin.company, role: pin.title })}</Button>)}
      </div>
      {selectedPin && !query.isError ? <JobsMapLocationPanel key={selectedPin.job_ids.join(',')} pin={selectedPin} userId={userId} filters={filters} onSelectJob={onSelectJob} onSelectLocation={officeLayer ? undefined : onSelectLocation} onClose={() => { setSelectedPin(null); selectionTrigger.current?.focus(); }} /> : null}
    </div>
  </section>;
}
