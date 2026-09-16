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

/**
 * Enables the seeded local developer account only for a Vite development
 * server that targets the local Supabase stack. Keeping all three conditions
 * prevents an environment variable copied to a hosted build from bypassing
 * authentication.
 */
export const isLocalDevelopmentAuthBypass =
  import.meta.env.DEV &&
  import.meta.env.VITE_SKIP_AUTH === 'true' &&
  isLocalSupabaseUrl(supabaseUrl);

export const localDevelopmentCredentials = {
  email: 'admin@example.com',
  password: 'local-dev-password',
};
