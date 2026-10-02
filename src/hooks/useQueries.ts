import { useEffect } from 'react';
import { resolveScoringRules } from '../lib/scoringRules';
import type { ScoringRules } from '../types/job';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Job, Source, Profile, JobStatus, OverviewMetrics, JobsPageParams, JobsPageResult, UserDocumentMetadata } from "../types/job";
import { getCurrentUserId } from "../lib/userSession";
import { candidateEvaluationFields } from "../lib/candidateEvaluation";
import { DEFAULT_PROFILE } from "../lib/defaultProfile";
import { queryKeys } from "../lib/queryKeys";
export { queryKeys } from "../lib/queryKeys";
import {
  loadUserProfile,
  saveUserProfile,
  loadUserCVsMetadata,
  loadUserCoverLettersMetadata,
  saveUserCV,
  saveUserCoverLetter,
  deleteUserCV,
  deleteUserCoverLetter,
  saveUserAvatar,
  type DocumentUpload,
} from "../lib/userProfile";

import { validateJobMapResult, validateOverviewMetrics, validateJobsPageResult } from '../lib/rpcValidation';
export { validateOverviewMetrics, validateJobsPageResult } from '../lib/rpcValidation';

/** Refuse results and actions when the query-key owner is no longer the active session. */
async function withActiveUser<T>(expected: string | null | undefined, operation: () => Promise<T>): Promise<T> {
  if (!expected || await getCurrentUserId() !== expected) throw new Error('Active account changed');
  const result = await operation();
  if (await getCurrentUserId() !== expected) throw new Error('Active account changed');
  return result;
}

export function useOverviewMetricsQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.overviewMetrics(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<OverviewMetrics> => withActiveUser(activeUserId, async () => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_overview_metrics");
      if (error) throw new Error(error.message);
      return validateOverviewMetrics(data);
    }),
    refetchInterval: 120_000,
    staleTime: 1000 * 60 * 3, // 3 minutes
  });
}

export function useJobsPageQuery(
  activeUserId?: string | null,
  params: JobsPageParams = {},
  enabled = true
) {
  const pageLimit = Math.min(Math.max(params.limit ?? 40, 1), 100);

  return useQuery({
    queryKey: queryKeys.jobsSearchPage(activeUserId, params),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async ({ signal }): Promise<JobsPageResult> => withActiveUser(activeUserId, async () => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_jobs_page", {
        p_status: params.status || "all",
        p_domain: params.domain || "all",
        p_min_match: params.minMatch ?? 0,
        p_location: params.location || "all",
        p_salary: params.salary || "all",
        p_search: params.search || undefined,
        p_sort_by: params.sortBy || "match",
        p_sort_dir: params.sortDir || "desc",
        p_limit: pageLimit,
        p_offset: params.offset ?? 0,
      }).abortSignal(signal);

      if (error) throw new Error(error.message);
      return validateJobsPageResult(data);
    }),
    refetchInterval: 120_000,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useJobsInfiniteQuery(
  activeUserId?: string | null,
  params: Omit<JobsPageParams, 'limit' | 'offset'> = {},
  enabled = true
) {
  const PAGE_LIMIT = 40;

  return useInfiniteQuery({
    queryKey: queryKeys.jobsPage(activeUserId, params),
    initialPageParam: 0,
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async ({ pageParam, signal }): Promise<JobsPageResult> => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error('Supabase is not initialized. Check your environment variables.');
      const { data, error } = await supabase.rpc('get_jobs_page', {
        p_status: params.status || 'all',
        p_domain: params.domain || 'all',
        p_min_match: params.minMatch ?? 0,
        p_location: params.location || 'all',
        p_salary: params.salary || 'all',
        p_search: params.search || undefined,
        p_sort_by: params.sortBy || 'match',
        p_sort_dir: params.sortDir || 'desc',
        p_limit: PAGE_LIMIT,
        p_offset: pageParam as number,
      }).abortSignal(signal);
      if (error) throw new Error(error.message);
      return validateJobsPageResult(data);
    }),
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return fetched < lastPage.total ? fetched : undefined;
    },
    refetchInterval: 120_000,
    staleTime: 1000 * 60 * 2,
  });
}

/** Fetch the evaluated candidate pool so weight changes can change the top five. */
export function useScoringPreviewJobsQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.scoringPreviewJobs(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<Job[]> => withActiveUser(activeUserId, async () => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      if (!activeUserId) return [];
      const userId = await getCurrentUserId();
      const pageSize = 500;
      const candidateLimit = 1500;
      const jobs: Job[] = [];
      for (let offset = 0; offset < candidateLimit; offset += pageSize) {
        const { data, error } = await supabase
          .from("user_job_evaluations")
          .select("job_id, relevance, fit_tier, matched_skills, ai_analysis, jobs!inner(id, title, company, location, employment_type, salary_text, salary_min_amount, salary_max_amount, salary_currency, salary_period, url, source, last_seen_at)")
          .eq("user_id", userId)
          .order("relevance", { ascending: false })
          .order("job_id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        for (const evaluation of data ?? []) {
          const job = evaluation.jobs;
          if (!job) continue;
          jobs.push({
            ...job,
            ...candidateEvaluationFields(evaluation),
            status: 'new',
            last_seen_at: job.last_seen_at ?? '',
          });
        }
        if ((data?.length ?? 0) < pageSize) break;
      }
      return jobs;
    }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useJobDetailQuery(jobId?: number | null, activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.jobDetail(jobId, activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<{ description?: string; ai_analysis?: Job['ai_analysis']; relevance: number; fit_tier?: string }> => withActiveUser(activeUserId, async () => {
      if (!supabase || !jobId) throw new Error("Supabase is not initialized or invalid jobId");
      const userId = activeUserId ? await getCurrentUserId() : null;

      const [jobRes, evalRes, profileRes] = await Promise.all([
        supabase.from("jobs").select("description").eq("id", jobId).maybeSingle(),
        userId
          ? supabase
              .from("user_job_evaluations")
              .select("relevance, fit_tier, matched_skills, ai_analysis")
              .eq("job_id", jobId)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('user_profiles').select('scoring_rules').eq('user_id', userId!).maybeSingle(),
      ]);

      if (jobRes.error) throw new Error(jobRes.error.message);

      if (evalRes.error) throw new Error(evalRes.error.message);
      if (profileRes.error) throw new Error(profileRes.error.message);
      const fields = candidateEvaluationFields(evalRes.data, resolveScoringRules(profileRes.data?.scoring_rules as unknown as ScoringRules));

      return {
        description: jobRes.data?.description ?? undefined,
        ai_analysis: fields.ai_analysis,
        relevance: fields.relevance,
        fit_tier: fields.fit_tier,
      };
    }),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/** Fetches a single job by ID. */
export function useJobByIdQuery(jobId?: number | null, activeUserId?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.jobById(jobId, activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<Job | null> => withActiveUser(activeUserId, async () => {
      if (!supabase || !jobId) return null;
      const userId = activeUserId ? await getCurrentUserId() : null;
      const [jobResult, statusResult, evaluationResult, profileResult] = await Promise.all([
        supabase.from('jobs').select('*, employers(sector, metadata_source)').eq('id', jobId).maybeSingle(),
        userId
          ? supabase.from('user_job_statuses').select('status').eq('job_id', jobId).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        userId
          ? supabase.from('user_job_evaluations').select('relevance, fit_tier, matched_skills, ai_analysis').eq('job_id', jobId).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('user_profiles').select('scoring_rules').eq('user_id', userId!).maybeSingle(),
      ]);
      if (jobResult.error) throw new Error(jobResult.error.message);
      if (statusResult.error) throw new Error(statusResult.error.message);
      if (evaluationResult.error) throw new Error(evaluationResult.error.message);
      if (!jobResult.data) return null;
      if (profileResult.error) throw new Error(profileResult.error.message);
      const evaluation = evaluationResult.data;
      return {
        ...jobResult.data,
        domain: jobResult.data.employers && ['curated', 'verified', 'watchlist'].includes(jobResult.data.employers.metadata_source)
          ? jobResult.data.employers.sector || 'Uncategorized' : 'Uncategorized',
        latitude: ['posting', 'geocoded'].includes(jobResult.data.coordinate_source ?? '') ? jobResult.data.latitude : null,
        longitude: ['posting', 'geocoded'].includes(jobResult.data.coordinate_source ?? '') ? jobResult.data.longitude : null,
        last_seen_at: jobResult.data.last_seen_at ?? new Date().toISOString(),
        ...candidateEvaluationFields(evaluation, resolveScoringRules(profileResult.data?.scoring_rules as unknown as ScoringRules)),
        status: (statusResult.data?.status ?? 'new') as JobStatus,
      };
    }),
    staleTime: 1000 * 60 * 10,
  });
}

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

export function useProfileQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.profile(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<Profile> => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return DEFAULT_PROFILE;
      const data = await loadUserProfile();
      return data || DEFAULT_PROFILE;
    }),
  });
}

export function useUpdateJobStatusMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ job, status }: { job: Job; status: JobStatus }) => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error("Supabase client is not configured");
      if (!activeUserId) throw new Error("Active user session required");
      const userId = await getCurrentUserId();

      const { error } = await supabase.from("user_job_statuses").upsert(
        {
          user_id: userId,
          job_id: job.id,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,job_id" }
      );

      if (error) throw new Error(error.message);
      return { jobId: job.id, status };
    }),
    onMutate: async ({ job, status }) => {
      const jobByIdKey = queryKeys.jobById(job.id, activeUserId);
      await queryClient.cancelQueries({ queryKey: jobByIdKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.jobsPage(activeUserId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.jobsSearchPage(activeUserId) });

      const previousJobById = queryClient.getQueryData<Job | null>(jobByIdKey);

      queryClient.setQueryData<Job | null>(
        jobByIdKey,
        (old) => (old ? { ...old, status } : old)
      );

      queryClient.setQueriesData<InfiniteData<JobsPageResult>>(
        { queryKey: queryKeys.jobsPage(activeUserId) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((j) => (j.id === job.id ? { ...j, status } : j)),
            })),
          };
        }
      );

      queryClient.setQueriesData<JobsPageResult>(
        { queryKey: queryKeys.jobsSearchPage(activeUserId) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((j) => (j.id === job.id ? { ...j, status } : j)),
          };
        }
      );

      return { previousJobById, jobByIdKey };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousJobById !== undefined && context.jobByIdKey) {
        queryClient.setQueryData(context.jobByIdKey, context.previousJobById);
      }
      if (context?.jobByIdKey) {
        void queryClient.invalidateQueries({ queryKey: context.jobByIdKey });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsPage(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobMap(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsSearchPage(activeUserId) });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.jobByIdKey) {
        void queryClient.invalidateQueries({ queryKey: context.jobByIdKey });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsPage(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobMap(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsSearchPage(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overviewMetrics(activeUserId) });
    },
  });
}

export function useSaveProfileMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: queryKeys.profile(activeUserId),
    mutationFn: async (updatedProfile: Profile) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return { success: false, error: "Active user session required." };
      return saveUserProfile(updatedProfile);
    }),
    onSuccess: (res, updatedProfile) => {
      if (res.success) {
        queryClient.setQueryData(queryKeys.profile(activeUserId), updatedProfile);
      }
    },
  });
}

export function useDeleteAccountMutation() {
  return useMutation({
    mutationFn: async (confirmation: string): Promise<void> => {
      if (!supabase) throw new Error('Supabase is not initialized');
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation },
      });
      if (error || !data || data.success !== true) {
        throw new Error('Account deletion failed');
      }
    },
  });
}

export function useUserCvsQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.userCvs(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<UserDocumentMetadata[]> => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return [];
      return loadUserCVsMetadata();
    }),
  });
}

export function useUserCoverLettersQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.userCoverLetters(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<UserDocumentMetadata[]> => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return [];
      return loadUserCoverLettersMetadata();
    }),
  });
}

export function useSaveCvMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DocumentUpload) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) throw new Error("Active user session required");
      return saveUserCV(params.file, params.description);
    }),
    onSuccess: (res) => {
      if (res.success) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCvs(activeUserId) });
      }
    },
  });
}

export function useDeleteCvMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => withActiveUser(activeUserId, async () => {
      return deleteUserCV(id);
    }),
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCvs(activeUserId) });
      }
    },
  });
}

export function useSaveCoverLetterMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DocumentUpload) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) throw new Error("Active user session required");
      return saveUserCoverLetter(params.file, params.description);
    }),
    onSuccess: (res) => {
      if (res.success) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCoverLetters(activeUserId) });
      }
    },
  });
}

export function useDeleteCoverLetterMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => withActiveUser(activeUserId, async () => {
      return deleteUserCoverLetter(id);
    }),
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCoverLetters(activeUserId) });
      }
    },
  });
}

export function useSaveAvatarMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) throw new Error("Active user session required");
      const result = await saveUserAvatar(file);
      if ("error" in result) throw new Error(result.error);
      return result.path;
    }),
    onSuccess: (path) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.avatarUrl(path) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(activeUserId) });
    },
  });
}

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
      const { data, error } = await supabase.rpc('create_invitation', {
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
      const { data, error } = await supabase.rpc('delete_invitation', {
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
        revision: `${data.completed_revision}:${data.updated_at}` };
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

/** Account export is a one-shot mutation; private payloads never enter the query cache. */
export function useExportAccountMutation() {
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Database unavailable');
      const userId = await getCurrentUserId();
      const records: Record<string, unknown[]> = {};
      const tables = ['user_profiles', 'user_job_statuses', 'user_job_evaluations', 'user_cvs', 'user_cover_letters', 'authorized_users'] as const;
      for (const table of tables) {
        records[table] = [];
        for (let offset = 0; ; offset += 500) {
          const request = table === 'authorized_users'
            ? supabase.from('authorized_users').select('*').eq('invited_by', userId).order('id')
            : supabase.from(table).select('*').eq('user_id', userId).order('id');
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

/** Complete filtered catalog, clustered and bounded on the server; never page-local pins. */
export function useJobMapQuery(userId: string | null | undefined, params: import('../types/job').JobsPageParams,
  bounds: number[], zoom: number) {
  return useQuery({
    queryKey: queryKeys.jobMap(userId, { ...params, bounds, zoom }),
    enabled: Boolean(supabase) && Boolean(userId),
    queryFn: () => withActiveUser(userId, async () => {
      if (!supabase) throw new Error('Supabase is not initialized');
      const { data, error } = await supabase.rpc('get_job_map', {
        p_status: params.status || 'all', p_domain: params.domain || 'all', p_min_match: params.minMatch || 0,
        p_location: params.location || 'all', p_salary: params.salary || 'all', p_search: params.search || undefined,
        p_bounds: bounds, p_zoom: zoom,
      });
      if (error) throw new Error(error.message);
      return validateJobMapResult(data);
    }),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
