import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Job, Source, Profile, JobStatus, OverviewMetrics, JobsPageParams, JobsPageResult, UserDocumentMetadata } from "../types/job";
import { getCurrentUserId } from "../lib/userSession";
import { candidateEvaluationFields } from "../lib/candidateEvaluation";
import { DEFAULT_PROFILE } from "../lib/defaultProfile";
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

export const queryKeys = {
  overviewMetrics: (userId?: string | null) => ["overview-metrics", userId ?? null] as const,
  jobsPage: (userId?: string | null, params?: unknown) => ["jobs-page", userId ?? null, ...(params === undefined ? [] : [params])] as const,
  jobsSearchPage: (userId?: string | null, params?: unknown) => ["jobs-search-page", userId ?? null, ...(params === undefined ? [] : [params])] as const,
  scoringPreviewJobs: (userId?: string | null) => ["scoring-preview-jobs", userId ?? null] as const,
  jobById: (id?: number | null, userId?: string | null) => ["job-by-id", id, userId ?? null] as const,
  jobDetail: (id?: number | null, userId?: string | null) => ["job-detail", id, userId ?? null] as const,
  sources: () => ["sources"] as const,
  profile: (userId?: string | null) => ["profile", userId ?? null] as const,
  userCvs: (userId?: string | null) => ["user-cvs", userId ?? null] as const,
  userCoverLetters: (userId?: string | null) => ["user-cover-letters", userId ?? null] as const,
  invitations: (userId?: string | null) => ["invitations", userId ?? null] as const,
};

export function validateOverviewMetrics(data: unknown): OverviewMetrics {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid overview metrics response: expected object');
  }
  const obj = data as Record<string, unknown>;
  if (!obj.counts || typeof obj.counts !== 'object' || Array.isArray(obj.counts)
    || !Array.isArray(obj.categories)
    || !Array.isArray(obj.relevance_distribution)
    || !Array.isArray(obj.top_skills)) {
    throw new Error('Invalid overview metrics response: missing chart data');
  }
  return {
    total: typeof obj.total === 'number' ? obj.total : 0,
    high_fit: typeof obj.high_fit === 'number' ? obj.high_fit : 0,
    counts: obj.counts as Record<string, number>,
    stage_averages: obj.stage_averages && typeof obj.stage_averages === 'object' && !Array.isArray(obj.stage_averages)
      ? Object.fromEntries(Object.entries(obj.stage_averages).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)))
      : {},
    categories: obj.categories.map((c) => ({
          name: String((c as Record<string, unknown>).name ?? ''),
          value: Number((c as Record<string, unknown>).value ?? 0),
          avgMatch: Number((c as Record<string, unknown>).avgMatch ?? 0),
        })),
    relevance_distribution: obj.relevance_distribution.map((r) => ({
          range: String((r as Record<string, unknown>).range ?? ''),
          min: Number((r as Record<string, unknown>).min ?? 0),
          max: Number((r as Record<string, unknown>).max ?? 0),
          count: Number((r as Record<string, unknown>).count ?? 0),
        })),
    top_skills: obj.top_skills.map((s) => ({
          skill: String((s as Record<string, unknown>).skill ?? ''),
          count: Number((s as Record<string, unknown>).count ?? 0),
          percentage: Number((s as Record<string, unknown>).percentage ?? 0),
        })),
  };
}

export function validateJobsPageResult(data: unknown): JobsPageResult {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid jobs page response: expected object');
  }
  const obj = data as Record<string, unknown>;
  const total = typeof obj.total === 'number' ? obj.total : 0;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];

  const items: Job[] = rawItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      id: Number(item.id),
      title: String(item.title ?? ''),
      company: String(item.company ?? ''),
      location: String(item.location ?? ''),
      employment_type: String(item.employment_type ?? ''),
      salary_text: item.salary_text ? String(item.salary_text) : null,
      salary_min_amount: typeof item.salary_min_amount === 'number' ? item.salary_min_amount : null,
      salary_max_amount: typeof item.salary_max_amount === 'number' ? item.salary_max_amount : null,
      salary_currency: typeof item.salary_currency === 'string' ? item.salary_currency : null,
      salary_period: typeof item.salary_period === 'string' ? item.salary_period : null,
      description: item.description ? String(item.description) : undefined,
      url: String(item.url ?? ''),
      source: String(item.source ?? ''),
      relevance: Number(item.relevance ?? 0),
      matched_skills: Array.isArray(item.matched_skills) ? (item.matched_skills as string[]) : [],
      fit_tier: item.fit_tier ? String(item.fit_tier) : undefined,
      role_domain: item.role_domain ? String(item.role_domain) : undefined,
      seniority_level: item.seniority_level ? String(item.seniority_level) : undefined,
      sub_scores: (item.sub_scores && typeof item.sub_scores === 'object' && !Array.isArray(item.sub_scores))
        ? (item.sub_scores as Job['sub_scores'])
        : undefined,
      status: (typeof item.status === 'string' && ['new', 'applied', 'interviewing', 'interested', 'not_interested'].includes(item.status))
        ? (item.status as JobStatus)
        : 'new',
      last_seen_at: String(item.last_seen_at ?? new Date().toISOString()),
    };
  });

  return { total, items };
}

export function useOverviewMetricsQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.overviewMetrics(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<OverviewMetrics> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_overview_metrics");
      if (error) throw new Error(error.message);
      return validateOverviewMetrics(data);
    },
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
    queryFn: async (): Promise<JobsPageResult> => {
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
      });

      if (error) throw new Error(error.message);
      return validateJobsPageResult(data);
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    placeholderData: (previousData) => previousData,
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
    queryFn: async ({ pageParam }): Promise<JobsPageResult> => {
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
      });
      if (error) throw new Error(error.message);
      return validateJobsPageResult(data);
    },
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return fetched < lastPage.total ? fetched : undefined;
    },
    staleTime: 1000 * 60 * 2,
  });
}

/** Bounded preview for profile scoring. */
export function useScoringPreviewJobsQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.scoringPreviewJobs(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<Job[]> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      if (!activeUserId) return [];
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("user_job_evaluations")
        .select("relevance, fit_tier, matched_skills, ai_analysis, jobs!inner(id, title, company, location, employment_type, salary_text, salary_min_amount, salary_max_amount, salary_currency, salary_period, url, source, last_seen_at)")
        .eq("user_id", userId)
        .order("relevance", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return (data ?? []).flatMap((evaluation) => {
        const job = evaluation.jobs;
        if (!job) return [];
        return [{
          ...job,
          ...candidateEvaluationFields(evaluation),
          status: 'new',
        } as Job];
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useJobDetailQuery(jobId?: number | null, activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.jobDetail(jobId, activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<{ description?: string; ai_analysis?: Job['ai_analysis'] }> => {
      if (!supabase || !jobId) throw new Error("Supabase is not initialized or invalid jobId");
      const userId = activeUserId ? await getCurrentUserId() : null;

      const [jobRes, evalRes] = await Promise.all([
        supabase.from("jobs").select("description").eq("id", jobId).maybeSingle(),
        userId
          ? supabase
              .from("user_job_evaluations")
              .select("ai_analysis")
              .eq("job_id", jobId)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (jobRes.error) throw new Error(jobRes.error.message);

      if (evalRes.error) throw new Error(evalRes.error.message);
      const aiAnalysis = candidateEvaluationFields(evalRes.data).ai_analysis;

      return {
        description: jobRes.data?.description ?? undefined,
        ai_analysis: aiAnalysis,
      };
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/** Fetches a single job by ID. */
export function useJobByIdQuery(jobId?: number | null, activeUserId?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.jobById(jobId, activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<Job | null> => {
      if (!supabase || !jobId) return null;
      const userId = activeUserId ? await getCurrentUserId() : null;
      const [jobResult, statusResult, evaluationResult] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', jobId).maybeSingle(),
        userId
          ? supabase.from('user_job_statuses').select('status').eq('job_id', jobId).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        userId
          ? supabase.from('user_job_evaluations').select('relevance, fit_tier, matched_skills, ai_analysis').eq('job_id', jobId).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (jobResult.error) throw new Error(jobResult.error.message);
      if (statusResult.error) throw new Error(statusResult.error.message);
      if (evaluationResult.error) throw new Error(evaluationResult.error.message);
      if (!jobResult.data) return null;
      const evaluation = evaluationResult.data;
      return {
        ...jobResult.data,
        last_seen_at: jobResult.data.last_seen_at ?? new Date().toISOString(),
        ...candidateEvaluationFields(evaluation),
        status: (statusResult.data?.status ?? 'new') as JobStatus,
      };
    },
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
      const { data, error } = await supabase.from("sources").select("*").order("name", { ascending: true }).limit(200);
      if (error) throw new Error(error.message);
      return (data || []) as Source[];
    },
  });
}

export function useProfileQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.profile(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<Profile> => {
      if (!activeUserId) return DEFAULT_PROFILE;
      const data = await loadUserProfile();
      return data || DEFAULT_PROFILE;
    },
  });
}

export function useUpdateJobStatusMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ job, status }: { job: Job; status: JobStatus }) => {
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
    },
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsSearchPage(activeUserId) });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.jobByIdKey) {
        void queryClient.invalidateQueries({ queryKey: context.jobByIdKey });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsPage(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobsSearchPage(activeUserId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overviewMetrics(activeUserId) });
    },
  });
}

export function useSaveProfileMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updatedProfile: Profile) => {
      if (!activeUserId) return { success: false, error: "Active user session required." };
      return saveUserProfile(updatedProfile);
    },
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
    queryFn: async (): Promise<UserDocumentMetadata[]> => {
      if (!activeUserId) return [];
      return loadUserCVsMetadata();
    },
  });
}

export function useUserCoverLettersQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.userCoverLetters(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<UserDocumentMetadata[]> => {
      if (!activeUserId) return [];
      return loadUserCoverLettersMetadata();
    },
  });
}

export function useSaveCvMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DocumentUpload) => {
      if (!activeUserId) throw new Error("Active user session required");
      return saveUserCV(params.file, params.description);
    },
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
    mutationFn: async (id: number) => {
      return deleteUserCV(id);
    },
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
    mutationFn: async (params: DocumentUpload) => {
      if (!activeUserId) throw new Error("Active user session required");
      return saveUserCoverLetter(params.file, params.description);
    },
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
    mutationFn: async (id: number) => {
      return deleteUserCoverLetter(id);
    },
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
    mutationFn: async (file: File) => {
      if (!activeUserId) throw new Error("Active user session required");
      const result = await saveUserAvatar(file);
      if ("error" in result) throw new Error(result.error);
      return result.path;
    },
    onSuccess: (path) => {
      void queryClient.invalidateQueries({ queryKey: ['avatar-url', path] });
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

export function useInvitationsQuery(activeUserId?: string | null) {
  return useQuery({
    queryKey: queryKeys.invitations(activeUserId),
    queryFn: async (): Promise<InvitationItem[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('authorized_users')
        .select('id, email, role, status, invite_code, created_at, accepted_at, invited_by')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as InvitationItem[];
    },
    enabled: Boolean(activeUserId),
    staleTime: 30_000,
  });
}

export function useCreateInvitationMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      if (!supabase) throw new Error("Database not connected");
      const { data, error } = await supabase.rpc('create_invitation', {
        target_email: email,
      });
      if (error) throw error;
      return data as { success: boolean; id: number; email: string; role: string; invite_code: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(activeUserId) });
    },
  });
}

export function useDeleteInvitationMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: number) => {
      if (!supabase) throw new Error("Database not connected");
      const { data, error } = await supabase.rpc('delete_invitation', {
        invitation_id: invitationId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(activeUserId) });
    },
  });
}
