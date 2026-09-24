import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const LEGACY_PUBLIC_PATH = '/storage/v1/object/public/avatars/';

export function avatarStoragePath(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return null;
  if (!value.includes('://')) return value;
  try {
    const url = new URL(value);
    const start = url.pathname.indexOf(LEGACY_PUBLIC_PATH);
    return start < 0 ? null : decodeURIComponent(url.pathname.slice(start + LEGACY_PUBLIC_PATH.length));
  } catch {
    return null;
  }
}

/** Resolve a private avatar path to a short-lived image URL for the current user. */
export function useAvatarUrl(value?: string | null): string | null {
  const path = avatarStoragePath(value);
  const { data } = useQuery({
    queryKey: ['avatar-url', path],
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
