import { render, act } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { JobMapPin } from '../../types/job';
import JobsMapCanvas from './JobsMapCanvas';

const engine = vi.hoisted(() => ({ setData: vi.fn(), events: new Map<string, () => void>(), remove: vi.fn(), addSource: vi.fn() }));
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(), NavigationControl: class {},
  Map: class {
    addControl() {}
    on(event: string, callback: () => void) { if (typeof callback === 'function') engine.events.set(event, callback); }
    setStyle() {}
    addSource = engine.addSource;
    addLayer() {}
    getSource() { return { setData: engine.setData }; }
    getLayer() { return undefined; }
    getCanvas() { return document.createElement('canvas'); }
    getBounds() { return { getEast: () => -5, getWest: () => -11, getSouth: () => 51, getNorth: () => 56 }; }
    getZoom() { return 7.5; }
    resize() {}
    remove = engine.remove;
  },
}));
vi.mock('./jobMapStyle', async (original) => ({ ...await original<Record<string, unknown>>(), jobMapPalette: () => ({ point: 'blue', ring: 'white' }) }));
const pin: JobMapPin = { latitude: 53, longitude: -6, count: 2, job_ids: [1], title: 'Synthetic role', company: 'Synthetic employer', domain: 'Engineering', precision: 'city' };
const props = { scope: 'first', selectedPin: null, onSelectPin: vi.fn() };
beforeEach(() => { engine.setData.mockClear(); engine.events.clear(); engine.addSource.mockClear(); });
it('retains dots while the next camera response is pending, but clears errors and identity/filter changes', () => {
  const { rerender } = render(<JobsMapCanvas {...props} pins={[pin]} />);
  engine.setData.mockClear();
  rerender(<JobsMapCanvas {...props} pins={undefined} />);
  expect(engine.setData).not.toHaveBeenCalled();
  rerender(<JobsMapCanvas {...props} pins={[]} />);
  expect(engine.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
  rerender(<JobsMapCanvas {...props} pins={[pin]} />);
  engine.setData.mockClear();
  rerender(<JobsMapCanvas {...props} scope="another-user-or-filter" pins={undefined} />);
  expect(engine.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
});
it('restores job layers and current points when a basemap style is reloaded', () => {
  render(<JobsMapCanvas {...props} pins={[pin]} />);
  act(() => engine.events.get('style.load')?.());
  act(() => engine.events.get('style.load')?.());
  expect(engine.addSource).toHaveBeenCalledTimes(2);
  expect(engine.addSource).toHaveBeenLastCalledWith('jobpulse-jobs', expect.objectContaining({ data: expect.objectContaining({ features: [expect.objectContaining({ properties: { key: '-6:53', count: 2 }, geometry: { type: 'Point', coordinates: [-6, 53] } })] }) }));
});
