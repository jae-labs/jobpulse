import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey)
  : null;

/** Freeze the initiating account's token for a tenant mutation's transport. */
export async function getAccountClient(expectedUserId: string): Promise<SupabaseClient<Database>> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token || session.user.id !== expectedUserId) throw new Error('Active account changed');
  const token = session.access_token;
  return createClient<Database>(supabaseUrl, supabaseKey, { accessToken: async () => token });
}
