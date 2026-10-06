import type { TFunction } from 'i18next';

/** Translate the shared browsing groups while preserving raw labels in old URLs. */
export function getSectorLabel(sector: string, t: TFunction): string {
  return t(`sectors.labels.${sector}`, { defaultValue: sector });
}
