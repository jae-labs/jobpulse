import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Source } from "../types/job";
import { queryKeys } from "../lib/queryKeys";

export function useSourcesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sources(),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<Source[]> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized.");
      }
      const sources: Source[] = [];
      let cursor: number | undefined;
      for (;;) {
        let query = supabase.from("sources").select("*").order("id", { ascending: true }).limit(1000);
        if (cursor !== undefined) query = query.gt("id", cursor);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        sources.push(...(data || []));
        if (!data || data.length < 1000) break;
        cursor = data[data.length - 1].id;
      }
      return sources.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    },
  });
}
