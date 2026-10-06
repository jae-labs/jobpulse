import { useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase, getAccountClient } from "../lib/supabase";
import { queryKeys } from "../lib/queryKeys";
import { withActiveUser } from './withActiveUser';

export interface InvitationItem {
  id: number;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'revoked';
  invite_code: string | null;
  created_at: string | null;
  accepted_at: string | null;
  invited_by: string | null;
}

export function useInvitationsQuery(activeUserId?: string | null, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.invitations(activeUserId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<InvitationItem[]> => withActiveUser(activeUserId, async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('authorized_users')
        .select('id, email, role, status, invite_code, created_at, accepted_at, invited_by')
        .eq('invited_by', activeUserId!)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + 99);
      if (error) throw error;
      return (data || []) as InvitationItem[];
    }),
    getNextPageParam: (last, pages) => last.length === 100 ? pages.length * 100 : undefined,
    enabled: Boolean(supabase && activeUserId && enabled),
    staleTime: 30_000,
  });
  return { ...query, data: query.data?.pages.flat() };
}

export function useCreateInvitationMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email }: { email: string }) => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error("Database not connected");
      const client = await getAccountClient(activeUserId!);
      const { data, error } = await client.rpc('create_invitation', {
        target_email: email,
      });
      if (error) throw error;
      return data as { success: boolean; id: number; email: string; role: string; invite_code: string };
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(activeUserId) });
    },
  });
}

export function useDeleteInvitationMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: number) => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error("Database not connected");
      const client = await getAccountClient(activeUserId!);
      const { data, error } = await client.rpc('delete_invitation', {
        invitation_id: invitationId,
      });
      if (error) throw error;
      return data;
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(activeUserId) });
    },
  });
}
