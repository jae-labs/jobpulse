import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './JobsMapView.css';
import { Button } from '@jae-labs/ui';
import type { JobsPageParams } from '../../types/job';
import { useJobMapQuery } from '../../hooks/useQueries';
import { formatNumber } from '../../lib/i18n';

export default function JobsMapView({ userId, filters, onSelectJob }: {
  userId?: string | null;
  filters: JobsPageParams;
  onSelectJob: (id: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [viewport, setViewport] = useState({ bounds: [-180, -90, 180, 90], zoom: 3 });
  const [tilesFailed, setTilesFailed] = useState(false);
  const query = useJobMapQuery(userId, filters, viewport.bounds, viewport.zoom);
  const selectRef = useRef(onSelectJob);
  useEffect(() => { selectRef.current = onSelectJob; }, [onSelectJob]);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { worldCopyJump: true, zoomAnimation: false, fadeAnimation: false,
      markerZoomAnimation: false, minZoom: 2, maxZoom: 19 }).setView([20, 0], 3);
    mapRef.current = map;
    const tiles = L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      updateWhenIdle: true,
    }).addTo(map);
    tiles.on('tileerror', () => setTilesFailed(true));
    layerRef.current = L.layerGroup().addTo(map);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const bounds = map.getBounds();
        const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
        const width = bounds.getEast() - bounds.getWest();
        setViewport({ bounds: [width >= 360 ? -180 : wrap(bounds.getWest()), Math.max(-90, bounds.getSouth()),
          width >= 360 ? 180 : wrap(bounds.getEast()), Math.min(90, bounds.getNorth())], zoom: map.getZoom() });
      }, 250);
    };
    map.on('moveend', update);
    update();
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(container.current);
    return () => { clearTimeout(timer); observer.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (query.isError || !query.data) return;
    for (const pin of query.data.pins) {
      const label = pin.count === 1 ? `${pin.title} · ${pin.company}` : t('jobs.mapCluster', { count: pin.count });
      const marker = L.marker([pin.latitude, pin.longitude], {
        title: label, keyboard: true,
        icon: L.divIcon({ className: 'job-map-pin', html: `<span>${pin.count}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
      }).addTo(layer);
      const popup = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = label;
      popup.append(heading);
      if (pin.count === 1) {
        const domain = document.createElement('p');
        domain.textContent = t('jobs.mapDomain', { domain: pin.domain });
        popup.append(domain);
      }
      const precision = document.createElement('p');
      precision.textContent = t('jobs.mapPrecision', { precision: t(`jobs.locationPrecision.${pin.precision}`, { defaultValue: pin.precision }) });
      popup.append(precision);
      for (const id of pin.job_ids) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'job-map-open';
        button.textContent = t('jobs.mapOpenJob', { id });
        button.onclick = () => selectRef.current(id);
        popup.append(button);
      }
      if (pin.count > pin.job_ids.length) {
        const zoom = document.createElement('button');
        zoom.type = 'button'; zoom.className = 'job-map-open'; zoom.textContent = t('jobs.mapZoomCluster');
        zoom.onclick = () => map.setView([pin.latitude, pin.longitude], Math.min(map.getZoom() + 2, 19), { animate: false });
        popup.append(zoom);
      }
      marker.bindPopup(popup);
    }
  }, [query.data, query.isError, t]);

  useEffect(() => {
    const node = container.current;
    for (const [selector, key] of [['.leaflet-control-zoom-in', 'mapZoomIn'], ['.leaflet-control-zoom-out', 'mapZoomOut']]) {
      const button = node?.querySelector<HTMLElement>(selector);
      if (button) { button.title = t(`jobs.${key}`); button.setAttribute('aria-label', t(`jobs.${key}`)); }
    }
  }, [t]);

  const retryTiles = useCallback(() => {
    setTilesFailed(false);
    mapRef.current?.eachLayer((layer) => { if (layer instanceof L.TileLayer) layer.redraw(); });
  }, []);

  return <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label={t('jobs.layoutMapTitle')}>
    <div className="flex flex-wrap items-center gap-2 text-xs text-ds-text-secondary" aria-live="polite">
      {query.isPending || query.isFetching ? <span>{t('jobs.mapLoading')}</span> : null}
      {query.isError ? <><span role="alert">{t('jobs.mapError')}</span><Button variant="secondary" onClick={() => void query.refetch()}>{t('common.retry')}</Button></> : null}
      {!query.isError && query.data ? <>
        <span>{t('jobs.mapCoverage', { mapped: formatNumber(query.data.mapped, i18n.language), total: formatNumber(query.data.total, i18n.language) })}</span>
        <span>{t('jobs.mapUnlocated', { count: query.data.total - query.data.mapped })}</span>
        {query.data.mapped === 0 ? <span>{t('jobs.mapEmpty')}</span> : null}
        {query.data.truncated ? <span>{t('jobs.mapZoomMore')}</span> : null}
      </> : null}
      {tilesFailed ? <><span role="alert">{t('jobs.mapTilesError')}</span><Button variant="secondary" onClick={retryTiles}>{t('common.retry')}</Button></> : null}
    </div>
    <div ref={container} className="job-world-map min-h-[360px] flex-1 rounded-ds-card border border-ds-border" />
    <p className="text-xs text-ds-text-muted">{t('jobs.mapLocationNote')} · <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer" className="underline">{t('jobs.mapProvider')}</a></p>
  </section>;
}
