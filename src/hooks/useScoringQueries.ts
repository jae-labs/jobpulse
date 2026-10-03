import { useEffect } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { queryKeys } from "../lib/queryKeys";
import { withActiveUser } from './withActiveUser';

export function useScoringStateQuery(activeUserId?: string | null, enabled = true) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scoringState(activeUserId),
    enabled: Boolean(supabase && activeUserId && enabled),
    queryFn: async () => withActiveUser(activeUserId, async () => {
      const { data, error } = await supabase!.rpc('get_profile_embedding_state');
      if (error) throw new Error('Unable to load scoring progress');
      if (!data) return null;
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid scoring progress');
      return { state: typeof data.scoring_state === 'string' ? data.scoring_state : 'pending',
        completed: typeof data.completed_jobs === 'number' ? data.completed_jobs : 0,
        total: typeof data.total_jobs === 'number' ? data.total_jobs : 0,
        revision: `${data.completed_revision}` };
    }),
    refetchInterval: query => query.state.data?.state === 'complete' ? 120_000 : 10_000,
  });
  const revision = query.data?.revision;
  useEffect(() => {
    if (!revision || !activeUserId) return;
    void client.invalidateQueries({ queryKey: queryKeys.jobsPage(activeUserId) });
    void client.invalidateQueries({ queryKey: queryKeys.jobMap(activeUserId) });
    void client.invalidateQueries({ queryKey: queryKeys.jobsSearchPage(activeUserId) });
    void client.invalidateQueries({ queryKey: queryKeys.overviewMetrics(activeUserId) });
    void client.invalidateQueries({ queryKey: queryKeys.scoringPreviewJobs(activeUserId) });
    void client.invalidateQueries({ predicate: q => (q.queryKey[0] === 'job-by-id' || q.queryKey[0] === 'job-detail') && q.queryKey[2] === activeUserId });
  }, [revision, activeUserId, client]);
  return query;
}
