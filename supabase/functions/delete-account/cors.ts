/** Restrict the account-deletion function to configured browser origins. */
export const STATIC_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function resolveAllowedOrigins(configured: string | undefined): Set<string> {
  const origins = [...STATIC_ALLOWED_ORIGINS, ...(configured ?? '').split(',')];
  return new Set(origins.map((origin) => origin.trim()).filter(Boolean));
}

/** CORS headers for an allowed browser origin; no origin header for anything else. */
export function corsHeadersFor(origin: string | null, configured: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin && resolveAllowedOrigins(configured).has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

/** A request with no Origin (CLI, server-to-server) is not a browser CORS request. */
export function isOriginAllowed(origin: string | null, configured: string | undefined): boolean {
  return origin === null || resolveAllowedOrigins(configured).has(origin);
}
