import { memo, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import './SearchPlaceholder.css';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const getReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const getServerReducedMotion = () => true;

/** Keep each animated character local to the placeholder, outside the job list render tree. */
export const SearchPlaceholder = memo(function SearchPlaceholder() {
  const { t } = useTranslation();
  const reducedMotion = useSyncExternalStore(subscribeMotion, getReducedMotion, getServerReducedMotion);
  const words = useMemo(() => [
    t('jobs.searchTypingTitle'), t('jobs.searchTypingCompany'),
    t('jobs.searchTypingSkills'), t('jobs.searchTypingLocation'),
  ], [t]);
  const [typing, setTyping] = useState({ word: 0, length: 0, deleting: false });
  const word = words[typing.word];

  useEffect(() => {
    if (reducedMotion) return;
    const complete = typing.length === word.length;
    const delay = typing.deleting ? 45 : complete ? 1400 : typing.length === 0 ? 300 : 85;
    const timer = window.setTimeout(() => {
      setTyping((current) => {
        if (current.deleting) {
          return current.length === 0
            ? { word: (current.word + 1) % words.length, length: 0, deleting: false }
            : { ...current, length: current.length - 1 };
        }
        return current.length >= word.length
          ? { ...current, deleting: true }
          : { ...current, length: current.length + 1 };
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, typing, word, words.length]);

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-9 right-8 flex items-center overflow-hidden whitespace-nowrap text-xs text-ds-text-muted sm:right-16">
      {reducedMotion ? t('jobs.searchPlaceholder') : <>
        <span className="truncate">{t('jobs.searchTypingPrefix')} {word.slice(0, typing.length)}</span>
        <span className="job-search-caret ml-0.5 inline-block h-3.5 w-px shrink-0 bg-ds-text-muted" />
      </>}
    </span>
  );
});
