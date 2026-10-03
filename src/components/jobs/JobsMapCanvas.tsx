import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as GLMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@jae-labs/ui';
import type { JobMapPin } from '../../types/job';
import { DEFAULT_MAP_STYLE, JOB_SOURCE, JOB_POINTS, JOB_HALO, jobMapPalette, styleJobBasemap } from './jobMapStyle';

// Explicit Vite worker keeps runtime code on the site origin under production CSP.
setWorkerUrl(workerUrl);
const IRELAND: LngLatBoundsLike = [[-10.8, 51.3], [-5.3, 55.5]];
export const pinKey = (pin: JobMapPin) => `${pin.longitude}:${pin.latitude}`;
const empty = () => ({ type: 'FeatureCollection' as const, features: [] });
function features(pins: JobMapPin[]) {
  return { type: 'FeatureCollection' as const, features: pins.map((pin) => ({
    type: 'Feature' as const, id: pinKey(pin), properties: { key: pinKey(pin), count: pin.count },
    geometry: { type: 'Point' as const, coordinates: [pin.longitude, pin.latitude] },
  })) };
}

type Props = {
  scope: string;
  pins?: JobMapPin[];
  selectedPin: JobMapPin | null;
  onSelectPin: (pin: JobMapPin) => void;
  onViewport: (viewport: { bounds: number[]; zoom: number }) => void;
};

/** Preserve GPU source data during camera fetches; clear it on filter/identity changes. */
export default function JobsMapCanvas({ scope, pins, selectedPin, onSelectPin, onViewport }: Props) {
  const { t } = useTranslation();
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GLMap | null>(null);
  const points = useRef<JobMapPin[]>([]);
  const selection = useRef<JobMapPin | null>(selectedPin);
  const handlers = useRef({ onSelectPin, onViewport });
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { handlers.current = { onSelectPin, onViewport }; }, [onSelectPin, onViewport]);

  useEffect(() => {
    if (!node.current) return;
    let map: GLMap;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      map = new GLMap({ container: node.current,
        bounds: IRELAND, fitBoundsOptions: { padding: 32, maxZoom: 7 }, minZoom: 2, maxZoom: 19,
        renderWorldCopies: false, attributionControl: { compact: true },
        fadeDuration: reduceMotion ? 0 : 200, dragRotate: false, pitchWithRotate: false,
      });
    } catch {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    // Start compact; retain the built-in keyboard-accessible credit disclosure.
    map.on('load', () => {
      const attribution = node.current?.querySelector('.maplibregl-ctrl-attrib');
      if (attribution?.classList.contains('maplibregl-compact-show')) {
        attribution.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')?.click();
      }
    });
    map.on('error', () => setFailed(true));
    map.on('sourcedata', (event) => { if (event.isSourceLoaded) setFailed(false); });
    map.on('style.load', () => {
      const palette = jobMapPalette();
      map.addSource(JOB_SOURCE, { type: 'geojson', data: features(points.current) });
      map.addLayer({ id: JOB_HALO, type: 'circle', source: JOB_SOURCE, filter: ['==', ['get', 'key'], selection.current ? pinKey(selection.current) : ''],
        paint: { 'circle-radius': 22, 'circle-color': palette.point, 'circle-opacity': 0.35, 'circle-blur': 0.65 } });
      map.addLayer({ id: JOB_POINTS, type: 'circle', source: JOB_SOURCE, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, ['min', 17, ['+', 7, ['ln', ['max', 1, ['get', 'count']]]]], 16, 19],
        'circle-color': palette.point, 'circle-opacity': 0.75,
        'circle-stroke-color': palette.ring, 'circle-stroke-width': 1.5,
        'circle-opacity-transition': { duration: reduceMotion ? 0 : 180 },
      } });
    });
    map.setStyle(import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE, { transformStyle: (_previous, next) => styleJobBasemap(next) });
      map.on('click', JOB_POINTS, (event) => {
        const key = event.features?.[0]?.properties?.key;
        const pin = points.current.find((point) => pinKey(point) === key);
        if (pin) handlers.current.onSelectPin(pin);
      });
      map.on('mouseenter', JOB_POINTS, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', JOB_POINTS, () => { map.getCanvas().style.cursor = ''; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const bounds = map.getBounds();
        const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
        const width = bounds.getEast() - bounds.getWest();
        handlers.current.onViewport({ bounds: [width >= 360 ? -180 : wrap(bounds.getWest()), Math.max(-90, bounds.getSouth()),
          width >= 360 ? 180 : wrap(bounds.getEast()), Math.min(90, bounds.getNorth())], zoom: Math.floor(map.getZoom()) });
      }, 250);
    };
    map.on('moveend', update);
    update();
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(node.current);
    return () => { clearTimeout(timer); observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    points.current = [];
    (mapRef.current?.getSource(JOB_SOURCE) as GeoJSONSource | undefined)?.setData(empty());
  }, [scope]);
  useEffect(() => {
    if (!pins) return; // A new viewport is pending: retain visible dots until its response arrives.
    points.current = pins;
    (mapRef.current?.getSource(JOB_SOURCE) as GeoJSONSource | undefined)?.setData(features(pins));
  }, [pins, scope]);
  useEffect(() => {
    selection.current = selectedPin;
    const map = mapRef.current;
    if (map?.getLayer(JOB_HALO)) map.setFilter(JOB_HALO, ['==', ['get', 'key'], selectedPin ? pinKey(selectedPin) : '']);
  }, [selectedPin]);
  useEffect(() => {
    for (const [selector, key] of [['.maplibregl-ctrl-zoom-in', 'mapZoomIn'], ['.maplibregl-ctrl-zoom-out', 'mapZoomOut']]) {
      const control = node.current?.querySelector<HTMLButtonElement>(selector);
      if (control) { control.title = t(`jobs.${key}`); control.setAttribute('aria-label', t(`jobs.${key}`)); }
    }
    mapRef.current?.getCanvas().setAttribute('aria-label', t('jobs.layoutMapTitle'));
  }, [t]);

  return <div className="job-map-canvas-wrap">
    <div ref={node} tabIndex={-1} className="job-world-map h-full min-h-[320px] rounded-ds-card border border-ds-border" />
    {unavailable || failed ? <div className="job-map-message rounded-ds-control border border-ds-border bg-ds-panel p-3" role="alert">
      <p className="text-xs text-ds-text-secondary">{t(unavailable ? 'jobs.mapGraphicsUnavailable' : 'jobs.mapTilesError')}</p>
      {!unavailable ? <Button variant="secondary" size="sm" onClick={() => { setFailed(false); mapRef.current?.setStyle(import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE, { transformStyle: (_previous, next) => styleJobBasemap(next) }); }}>{t('common.retry')}</Button> : null}
    </div> : null}
  </div>;
}
