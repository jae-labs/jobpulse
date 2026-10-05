/** Return a normalized HTTP(S) URL or null for unsafe schemes. */
export function toSafeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}
