import { supabase } from "./supabase";

export async function getCurrentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not initialized");
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user.id) throw new Error("Active user session required");
  return session.user.id;
}
