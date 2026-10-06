import { useState, useSyncExternalStore } from 'react';

type JobLayout = 'split' | 'list' | 'map';
const COMPACT_QUERY = '(max-width: 1023px)';
function subscribe(onChange: () => void) {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const getCompact = () => window.matchMedia(COMPACT_QUERY).matches;
const getServerCompact = () => false;

/** Split is a desktop preference; compact screens always use list or map. */
export function useJobLayout() {
  const isCompact = useSyncExternalStore(subscribe, getCompact, getServerCompact);
  const [preferredLayout, setLayoutMode] = useState<JobLayout>('split');
  const layoutMode = isCompact && preferredLayout === 'split' ? 'list' : preferredLayout;
  const toggleMap = () => setLayoutMode(isCompact && layoutMode === 'map' ? 'list' : 'map');
  return { layoutMode, setLayoutMode, toggleMap, isCompact };
}
