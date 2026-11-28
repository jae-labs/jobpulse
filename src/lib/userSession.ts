import { supabase } from "./supabase";

export async function getCurrentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not initialized");
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user.id) throw new Error("Active user session required");
  return session.user.id;
}

export async function requireActiveUser(expectedUserId?: string | null): Promise<string> {
  const currentUserId = await getCurrentUserId();
  if (expectedUserId != null && currentUserId !== expectedUserId) {
    throw new Error('Active account changed');
  }
  return expectedUserId ?? currentUserId;
}
