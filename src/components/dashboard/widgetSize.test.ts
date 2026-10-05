import { afterEach, describe, expect, it } from 'vitest';
import { readWidgetSizes, snapWidgetHeight, snapMobileWidgetHeight } from './widgetSize';

describe('saved widget sizes', () => {
  afterEach(() => localStorage.clear());
  it('reads only known widgets with bounded dimensions and isolates account keys', () => {
    localStorage.setItem('sizes:user-a', JSON.stringify({
      valid: { columns: 7, height: 400 }, widthOnly: { columns: 20 },
      bad: { columns: 21, height: 400 }, corrupt: { columns: 4, height: '400' }, removed: { columns: 4 },
    }));
    expect(readWidgetSizes('sizes:user-a', ['valid', 'widthOnly', 'bad', 'corrupt'])).toEqual({ valid: { columns: 7, height: 400 }, widthOnly: { columns: 20 } });
    expect(readWidgetSizes('sizes:user-b', ['valid'])).toEqual({});
    expect(readWidgetSizes(null, ['valid'])).toEqual({});
  });
  it('preserves desktop sizes and snaps mobile heights including the grid gap', () => {
    localStorage.setItem('sizes', JSON.stringify({ valid: { columns: 7, height: 413 } }));
    expect(readWidgetSizes('sizes', ['valid'])).toEqual({ valid: { columns: 7, height: 413 } });
    expect(readWidgetSizes('sizes', ['valid'], 'mobile')).toEqual({ valid: { columns: 7, height: 428 } });
    expect(snapMobileWidgetHeight(151, 148)).toBe(148);
    expect(snapMobileWidgetHeight(190, 148)).toBe(188);
    expect(snapWidgetHeight(80, 100)).toBe(100);
    expect(snapWidgetHeight(337, 320)).toBe(320);
    expect(snapWidgetHeight(9999)).toBe(1200);
  });
  it('recovers from invalid stored JSON', () => {
    localStorage.setItem('sizes', '{bad');
    expect(readWidgetSizes('sizes', ['valid'])).toEqual({});
  });
});
