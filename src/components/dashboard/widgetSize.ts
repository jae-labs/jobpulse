export type WidgetViewport = 'mobile' | 'desktop';
export const widgetHeightStep = 40;
export const mobileWidgetGap = 12;

export function snapMobileWidgetHeight(height: number, minimum: number): number {
  const rows = Math.max(Math.ceil((minimum + mobileWidgetGap) / widgetHeightStep),
    Math.min(30, Math.round((height + mobileWidgetGap) / widgetHeightStep)));
  return rows * widgetHeightStep - mobileWidgetGap;
}

export function snapWidgetHeight(height: number, minimum = 80): number {
  return Math.max(minimum, Math.min(1200, Math.round(height / widgetHeightStep) * widgetHeightStep));
}

export interface WidgetSize {
  columns: number;
  height?: number;
}

export function readWidgetSizes(storageKey: string | null, widgetIds: readonly string[], viewport: WidgetViewport = 'desktop'): Record<string, WidgetSize> {
  if (!storageKey) return {};
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, WidgetSize] => {
      const [id, value] = entry;
      if (!widgetIds.includes(id) || !value || typeof value !== 'object') return false;
      const size = value as WidgetSize;
      return Number.isInteger(size.columns) && size.columns >= 4 && size.columns <= 20 &&
        (size.height === undefined || (Number.isInteger(size.height) && size.height >= 80 && size.height <= 1200));
    }).map(([id, size]) => [id, { ...size, ...(size.height === undefined ? {} : { height: viewport === 'mobile' ? snapMobileWidgetHeight(size.height, 148) : size.height }) }]));
  } catch {
    return {};
  }
}
