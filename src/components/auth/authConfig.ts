import { supabase } from '../../lib/supabase';

export interface AuthorizationResult {
  isAuthorized: boolean;
  role?: string;
  error?: string | null;
}

/**
 * Checks whether the given user email is registered in the 'authorized_users'
 * table on Supabase. No hardcoded emails exist in the frontend code.
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
      .select('email, role')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (error) {
      console.warn('Authorization lookup check error:', error.message);
      return { isAuthorized: false, error: error.message };
    }

    if (!data) {
      return { isAuthorized: false };
    }

    return { isAuthorized: true, role: data.role };
  } catch (err: any) {
    console.error('Unexpected error during authorization check:', err);
    return { isAuthorized: false, error: err?.message || 'Authorization check failed' };
  }
}
