/**
 * Cached CSS variable reader for chart SVG elements.
 * Prevents forced synchronous layout/reflows from repeated getComputedStyle calls.
 */

const cssVarCache = new Map<string, string>();

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(() => cssVarCache.clear());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });
}

export function getCachedCssVar(name: string, fallback: string = ''): string {
  if (typeof document === 'undefined') return fallback;
  const cached = cssVarCache.get(name);
  if (cached !== undefined) return cached;

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const result = value || fallback;
  cssVarCache.set(name, result);
  return result;
}
