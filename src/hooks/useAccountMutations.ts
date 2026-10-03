import { useMutation } from "@tanstack/react-query";
import { supabase, getAccountClient } from "../lib/supabase";
import { getCurrentUserId } from "../lib/userSession";

export function useDeleteAccountMutation(activeUserId?: string | null) {
  return useMutation({
    mutationFn: async (confirmation: string): Promise<void> => {
      if (!supabase) throw new Error('Supabase is not initialized');
      if (!activeUserId) throw new Error('Active user session required');
      const client = await getAccountClient(activeUserId);
      const { data, error } = await client.functions.invoke('delete-account', {
        body: { confirmation },
      });
      if (error || !data || data.success !== true) {
        throw new Error('Account deletion failed');
      }
    },
  });
}

export function useExportAccountMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Database unavailable');
      const userId = await getCurrentUserId();
      const client = await getAccountClient(userId);
      const records: Record<string, unknown[]> = {};
      const tables = ['user_profiles', 'user_job_statuses', 'user_job_evaluations', 'user_cvs', 'user_cover_letters', 'authorized_users'] as const;
      for (const table of tables) {
        records[table] = [];
        for (let offset = 0; ; offset += 500) {
          const request = table === 'authorized_users'
            ? client.from('authorized_users').select('*').eq('invited_by', userId).order('id')
            : client.from(table).select('*').eq('user_id', userId).order('id');
          const { data, error } = await request.range(offset, offset + 499);
          if (error) throw new Error('Account export failed');
          records[table].push(...(data ?? []));
          if ((data?.length ?? 0) < 500) break;
        }
      }
      if (await getCurrentUserId() !== userId) throw new Error('Account changed during export');
      const blob = new Blob([JSON.stringify({ format_version: 1, exported_at: new Date().toISOString(), records }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a'); link.href = url; link.download = 'jobpulse-account.json'; link.click();
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      return true;
    },
    gcTime: 0,
  });
}
