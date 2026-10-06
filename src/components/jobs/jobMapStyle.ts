import type { StyleSpecification } from 'maplibre-gl';
import { getCachedCssVar } from '../../lib/chartTheme';

export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const JOB_SOURCE = 'jobpulse-jobs';
export const JOB_POINTS = 'jobpulse-job-points';
export const JOB_HALO = 'jobpulse-job-halo';

/** Map-specific semantic colors; read once during renderer setup, outside React render. */
export function jobMapPalette() {
  return {
    water: getCachedCssVar('--jp-map-water'), land: getCachedCssVar('--jp-map-land'),
    road: getCachedCssVar('--jp-map-road'), label: getCachedCssVar('--jp-map-label'),
    point: getCachedCssVar('--jp-map-point'), ring: getCachedCssVar('--jp-map-point-ring'),
  };
}

/** Keep the provider's geography/label placement; apply JobPulse's subdued navy palette. */
export function styleJobBasemap(style: StyleSpecification): StyleSpecification {
  const palette = jobMapPalette();
  return { ...style, layers: style.layers.map((layer) => {
    if (layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': palette.land } };
    if (layer.type === 'fill') {
      const water = layer['source-layer'] === 'water';
      return { ...layer, paint: { ...layer.paint, 'fill-color': water ? palette.water : palette.land } };
    }
    if (layer.type === 'line') return { ...layer, paint: { ...layer.paint, 'line-color': palette.road } };
    if (layer.type === 'symbol') return { ...layer, paint: { ...layer.paint, 'text-color': palette.label, 'text-halo-color': palette.water, 'text-halo-width': 1.5 } };
    return layer;
  }) };
}
