import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { queryKeys } from './useQueries';

export function useSupabaseRealtime(session: Session | null, isAuthorized: boolean) {
  const queryClient = useQueryClient();
  const sharedChannelRef = useRef<RealtimeChannel | null>(null);
  const invalidateTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Coalesces bursts of realtime postgres_changes events into a single refetch per query key
  const debouncedInvalidate = useCallback(
    (queryKey: readonly unknown[], delay = 750) => {
      const timers = invalidateTimersRef.current;
      const key = JSON.stringify(queryKey);
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void queryClient.invalidateQueries({ queryKey });
        }, delay)
      );
    },
    [queryClient]
  );

  // Supabase Realtime Listener (Tenant-isolated peer broadcast + Postgres changes)
  useEffect(() => {
    if (!isAuthorized || !isSupabaseConfigured || !supabase) return;
    const realtimeClient = supabase;
    let isMounted = true;
    const cleanUserEmail = session?.user?.email?.trim().toLowerCase();

    // Public Shared Channel: global jobs & sources tables
    const sharedChannel = realtimeClient.channel('public:shared_feed');
    sharedChannelRef.current = sharedChannel;

    sharedChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs' },
      () => {
        if (!isMounted) return;
        debouncedInvalidate(queryKeys.overviewMetrics(cleanUserEmail));
        debouncedInvalidate(queryKeys.jobs(cleanUserEmail));
        debouncedInvalidate(queryKeys.scoringPreviewJobs(cleanUserEmail));
        debouncedInvalidate(queryKeys.jobCount());
        debouncedInvalidate(['jobs-page', cleanUserEmail]);
        debouncedInvalidate(['jobs-search-page', cleanUserEmail]);
      }
    );

    sharedChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sources' },
      () => {
        if (!isMounted) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.sources() });
      }
    );

    sharedChannel.subscribe();

    const handleOnline = () => {
      if (!isMounted) return;
      debouncedInvalidate(queryKeys.overviewMetrics(cleanUserEmail));
      debouncedInvalidate(['jobs-page', cleanUserEmail]);
      debouncedInvalidate(['jobs-search-page', cleanUserEmail]);
      debouncedInvalidate(queryKeys.jobs(cleanUserEmail));
      debouncedInvalidate(queryKeys.scoringPreviewJobs(cleanUserEmail));
      debouncedInvalidate(queryKeys.jobCount());
      debouncedInvalidate(queryKeys.sources());
    };
    window.addEventListener('online', handleOnline);

    const invalidateTimers = invalidateTimersRef.current;

    return () => {
      window.removeEventListener('online', handleOnline);
      for (const timer of invalidateTimers.values()) clearTimeout(timer);
      invalidateTimers.clear();
      isMounted = false;
      sharedChannelRef.current = null;
      void realtimeClient.removeChannel(sharedChannel);
    };
  }, [isAuthorized, session, queryClient, debouncedInvalidate]);
}
