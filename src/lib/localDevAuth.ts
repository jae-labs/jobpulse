const localSupabaseHosts = new Set(['127.0.0.1', 'localhost']);

function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && localSupabaseHosts.has(url.hostname);
  } catch {
    return false;
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

/** Enables local developer account in local Vite dev against local Supabase. */
export const isLocalDevelopmentAuthBypass =
  import.meta.env.DEV &&
  import.meta.env.VITE_SKIP_AUTH === 'true' &&
  isLocalSupabaseUrl(supabaseUrl);

export const localDevelopmentCredentials = {
  email: 'admin@example.com',
  password: 'local-dev-password',
};
