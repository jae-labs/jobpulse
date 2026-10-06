import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { supabase } from '../lib/supabase';

export function avatarStoragePath(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return null;
  return value.includes('://') ? null : value;
}

/** Resolve a private avatar path to a short-lived image URL for the current user. */
export function useAvatarUrl(value?: string | null): string | null {
  const path = avatarStoragePath(value);
  const { data } = useQuery({
    queryKey: queryKeys.avatarUrl(path),
    enabled: Boolean(path && supabase),
    queryFn: async () => {
      if (!supabase || !path) throw new Error('Avatar storage unavailable');
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 15 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
  return data ?? null;
}
