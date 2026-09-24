import { supabase } from '../../lib/supabase';
import { reportError, warn } from '../../lib/logger';

export interface AuthorizationResult {
  isAuthorized: boolean;
  role?: string;
  error?: string | null;
}

/**
 * Reads the invitation bound to the active verified Auth user. RLS uses the
 * immutable Auth user ID; the display email is not an authorization key.
 */
export async function checkUserAuthorization(
  email?: string | null
): Promise<AuthorizationResult> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) {
    return { isAuthorized: false, error: 'No email provided' };
  }

  if (!supabase) {
    return { isAuthorized: false, error: 'Database connection not initialized' };
  }

  try {
    const { data, error } = await supabase
      .from('authorized_users')
      .select('role')
      .maybeSingle();

    if (error) {
      warn('Authorization lookup check error:', error.message);
      return { isAuthorized: false, error: error.message };
    }

    if (!data) {
      return { isAuthorized: false };
    }

    return { isAuthorized: true, role: data.role };
  } catch (err: unknown) {
    reportError(err, { operation: 'check-user-authorization' });
    return { isAuthorized: false, error: err instanceof Error ? err.message : 'Authorization check failed' };
  }
}
