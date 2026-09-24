import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Job, Source, Profile, JobStatus, SubScores, OverviewMetrics, JobsPageParams, JobsPageResult, UserCVMetadata, UserCoverLetterMetadata } from "../types/job";
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
} from "../lib/userProfile";

async function currentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not initialized");
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user.id) throw new Error("Active user session required");
  return session.user.id;
}

export const queryKeys = {
  overviewMetrics: (email?: string | null) => ["overview-metrics", email ? email.trim().toLowerCase() : null] as const,
  jobsPage: (email?: string | null, params?: unknown) => ["jobs-page", email ? email.trim().toLowerCase() : null, params] as const,
  jobsSearchPage: (email?: string | null, params?: unknown) => ["jobs-search-page", email ? email.trim().toLowerCase() : null, params] as const,
  jobs: (email?: string | null) => ["jobs", email ? email.trim().toLowerCase() : null] as const,
  scoringPreviewJobs: (email?: string | null) => ["scoring-preview-jobs", email ? email.trim().toLowerCase() : null] as const,
  jobDetail: (id?: number | null, email?: string | null) => ["job-detail", id, email ? email.trim().toLowerCase() : null] as const,
  jobCount: () => ["job-count"] as const,
  sources: () => ["sources"] as const,
  profile: (email?: string | null) => ["profile", email ? email.trim().toLowerCase() : null] as const,
  userCvs: (email?: string | null) => ["user-cvs", email ? email.trim().toLowerCase() : null] as const,
  userCoverLetters: (email?: string | null) => ["user-cover-letters", email ? email.trim().toLowerCase() : null] as const,
};

export function validateOverviewMetrics(data: unknown): OverviewMetrics {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid overview metrics response: expected object');
  }
  const obj = data as Record<string, unknown>;
  return {
    total: typeof obj.total === 'number' ? obj.total : 0,
    high_fit: typeof obj.high_fit === 'number' ? obj.high_fit : 0,
    counts: (typeof obj.counts === 'object' && obj.counts !== null) ? (obj.counts as Record<string, number>) : {},
    categories: Array.isArray(obj.categories)
      ? obj.categories.map((c) => ({
          name: String((c as Record<string, unknown>).name ?? ''),
          value: Number((c as Record<string, unknown>).value ?? 0),
          avgMatch: Number((c as Record<string, unknown>).avgMatch ?? 0),
        }))
      : [],
    relevance_distribution: Array.isArray(obj.relevance_distribution)
      ? obj.relevance_distribution.map((r) => ({
          range: String((r as Record<string, unknown>).range ?? ''),
          min: Number((r as Record<string, unknown>).min ?? 0),
          max: Number((r as Record<string, unknown>).max ?? 0),
          count: Number((r as Record<string, unknown>).count ?? 0),
        }))
      : [],
    top_skills: Array.isArray(obj.top_skills)
      ? obj.top_skills.map((s) => ({
          skill: String((s as Record<string, unknown>).skill ?? ''),
          count: Number((s as Record<string, unknown>).count ?? 0),
          percentage: Number((s as Record<string, unknown>).percentage ?? 0),
        }))
      : [],
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

export function useOverviewMetricsQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.overviewMetrics(cleanEmail),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<OverviewMetrics> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_overview_metrics", {
        p_user_email: cleanEmail,
      });
      if (error) throw new Error(error.message);
      return validateOverviewMetrics(data);
    },
    staleTime: 1000 * 60 * 3, // 3 minutes
  });
}

export function useJobsPageQuery(
  userEmail?: string | null,
  params: JobsPageParams = {},
  enabled = true
) {
  const cleanEmail = userEmail?.trim().toLowerCase();
  const pageLimit = Math.min(Math.max(params.limit ?? 40, 1), 100);

  return useQuery({
    queryKey: queryKeys.jobsSearchPage(cleanEmail, params),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<JobsPageResult> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_jobs_page", {
        p_user_email: cleanEmail,
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
  userEmail?: string | null,
  params: Omit<JobsPageParams, 'limit' | 'offset'> = {},
  enabled = true
) {
  const cleanEmail = userEmail?.trim().toLowerCase();
  const PAGE_LIMIT = 40;

  return useInfiniteQuery({
    queryKey: queryKeys.jobsPage(cleanEmail, params),
    initialPageParam: 0,
    enabled: Boolean(supabase) && enabled,
    queryFn: async ({ pageParam }): Promise<JobsPageResult> => {
      if (!supabase) throw new Error('Supabase is not initialized. Check your environment variables.');
      const { data, error } = await supabase.rpc('get_jobs_page', {
        p_user_email: cleanEmail,
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

/** A bounded preview for profile scoring. The editor only renders the three
 * strongest scored examples, so downloading the complete job catalog is both
 * unnecessary and unsafe at production catalog sizes. */
export function useScoringPreviewJobsQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.scoringPreviewJobs(cleanEmail),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<Job[]> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      if (!cleanEmail) return [];
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("user_job_evaluations")
        .select("relevance, fit_tier, matched_skills, ai_analysis, jobs!inner(id, title, company, location, employment_type, salary_text, salary_min_amount, salary_max_amount, salary_currency, salary_period, url, source, status, last_seen_at, role_domain, seniority_level)")
        .eq("user_id", userId)
        .order("relevance", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return (data ?? []).flatMap((evaluation) => {
        const job = evaluation.jobs;
        if (!job) return [];
        return [{
          ...job,
          relevance: Number(evaluation.relevance ?? 0),
          fit_tier: evaluation.fit_tier || 'Unassessed',
          matched_skills: Array.isArray(evaluation.matched_skills) ? evaluation.matched_skills as string[] : [],
          ai_analysis: evaluation.ai_analysis as unknown as Job['ai_analysis'],
          sub_scores: (evaluation.ai_analysis as { sub_scores?: SubScores } | null)?.sub_scores,
        } as Job];
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useJobDetailQuery(jobId?: number | null, userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.jobDetail(jobId, cleanEmail),
    enabled: Boolean(supabase) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<{ description?: string; ai_analysis?: Record<string, unknown> }> => {
      if (!supabase || !jobId) throw new Error("Supabase is not initialized or invalid jobId");
      const userId = cleanEmail ? await currentUserId() : null;

      const [jobRes, evalRes] = await Promise.all([
        supabase.from("jobs").select("description, ai_analysis").eq("id", jobId).maybeSingle(),
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

      const aiAnalysis = evalRes.data?.ai_analysis || jobRes.data?.ai_analysis;

      return {
        description: jobRes.data?.description ?? undefined,
        ai_analysis: (aiAnalysis as Record<string, unknown> | null) ?? undefined,
      };
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/** Fetches one job independently of the paginated catalog so bookmarked URLs
 * continue to work after filtering or when the item falls outside loaded pages. */
export function useJobByIdQuery(jobId?: number | null, userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();
  return useQuery({
    queryKey: ['job-by-id', jobId, cleanEmail] as const,
    enabled: Boolean(supabase) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<Job | null> => {
      if (!supabase || !jobId) return null;
      const userId = cleanEmail ? await currentUserId() : null;
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
        role_domain: jobResult.data.role_domain ?? undefined,
        seniority_level: jobResult.data.seniority_level ?? undefined,
        fit_tier: evaluation?.fit_tier ?? jobResult.data.fit_tier ?? undefined,
        status: (statusResult.data?.status ?? jobResult.data.status ?? 'new') as JobStatus,
        relevance: evaluation?.relevance ?? jobResult.data.relevance,
        matched_skills: Array.isArray(evaluation?.matched_skills)
          ? (evaluation.matched_skills as string[])
          : (Array.isArray(jobResult.data.matched_skills) ? (jobResult.data.matched_skills as string[]) : []),
        ai_analysis: (evaluation?.ai_analysis && typeof evaluation.ai_analysis === 'object' && !Array.isArray(evaluation.ai_analysis))
          ? (evaluation.ai_analysis as unknown as Job['ai_analysis'])
          : (jobResult.data.ai_analysis && typeof jobResult.data.ai_analysis === 'object' && !Array.isArray(jobResult.data.ai_analysis))
            ? (jobResult.data.ai_analysis as unknown as Job['ai_analysis'])
            : undefined,
      };
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useJobCountQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.jobCount(),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<number> => {
      if (!supabase) return 0;
      const { count, error } = await supabase
        .from("jobs")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
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

export function useProfileQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.profile(cleanEmail),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<Profile> => {
      if (!cleanEmail) return DEFAULT_PROFILE;
      const data = await loadUserProfile(cleanEmail);
      return data || DEFAULT_PROFILE;
    },
  });
}

export function useUpdateJobStatusMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async ({ job, status }: { job: Job; status: JobStatus }) => {
      if (!supabase) throw new Error("Supabase client is not configured");
      if (!cleanEmail) throw new Error("Active user session required");
      const userId = await currentUserId();

      const { error } = await supabase.from("user_job_statuses").upsert(
        {
          user_id: userId,
          user_email: cleanEmail,
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
      const qk = queryKeys.jobs(cleanEmail);
      await queryClient.cancelQueries({ queryKey: qk });
      await queryClient.cancelQueries({ queryKey: ['jobs-page', cleanEmail] });
      await queryClient.cancelQueries({ queryKey: ['jobs-search-page', cleanEmail] });

      const previousJobs = queryClient.getQueryData<Job[]>(qk);

      if (previousJobs) {
        queryClient.setQueryData<Job[]>(
          qk,
          previousJobs.map((j) => (j.id === job.id ? { ...j, status } : j))
        );
      }

      queryClient.setQueriesData<InfiniteData<JobsPageResult>>(
        { queryKey: ['jobs-page', cleanEmail] },
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
        { queryKey: ['jobs-search-page', cleanEmail] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((j) => (j.id === job.id ? { ...j, status } : j)),
          };
        }
      );

      return { previousJobs, qk };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousJobs && context.qk) {
        queryClient.setQueryData(context.qk, context.previousJobs);
      }
      void queryClient.invalidateQueries({ queryKey: ['jobs-page', cleanEmail] });
      void queryClient.invalidateQueries({ queryKey: ['jobs-search-page', cleanEmail] });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.qk) {
        void queryClient.invalidateQueries({ queryKey: context.qk });
      }
      void queryClient.invalidateQueries({ queryKey: ['jobs-page', cleanEmail] });
      void queryClient.invalidateQueries({ queryKey: ['jobs-search-page', cleanEmail] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overviewMetrics(cleanEmail) });
    },
  });
}

export function useSaveProfileMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async (updatedProfile: Profile) => {
      if (!cleanEmail) return { success: false, error: "User email not found in active session." };
      return saveUserProfile(cleanEmail, updatedProfile);
    },
    onSuccess: (res, updatedProfile) => {
      if (res.success) {
        queryClient.setQueryData(queryKeys.profile(cleanEmail), updatedProfile);
      }
    },
  });
}

export function useUserCvsQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.userCvs(cleanEmail),
    enabled: Boolean(supabase) && Boolean(cleanEmail) && enabled,
    queryFn: async (): Promise<UserCVMetadata[]> => {
      if (!cleanEmail) return [];
      return loadUserCVsMetadata(cleanEmail);
    },
  });
}

export function useUserCoverLettersQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.userCoverLetters(cleanEmail),
    enabled: Boolean(supabase) && Boolean(cleanEmail) && enabled,
    queryFn: async (): Promise<UserCoverLetterMetadata[]> => {
      if (!cleanEmail) return [];
      return loadUserCoverLettersMetadata(cleanEmail);
    },
  });
}

export function useSaveCvMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async (params: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      fileData: File | Blob | string;
      description?: string;
    }) => {
      if (!cleanEmail) throw new Error("Active user session required");
      return saveUserCV(
        cleanEmail,
        params.fileName,
        params.fileSize,
        params.mimeType,
        params.fileData,
        params.description
      );
    },
    onSuccess: (res) => {
      if (res.success) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCvs(cleanEmail) });
      }
    },
  });
}

export function useDeleteCvMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async (id: number) => {
      return deleteUserCV(id);
    },
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCvs(cleanEmail) });
      }
    },
  });
}

export function useSaveCoverLetterMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async (params: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      fileData: File | Blob | string;
      description?: string;
    }) => {
      if (!cleanEmail) throw new Error("Active user session required");
      return saveUserCoverLetter(
        cleanEmail,
        params.fileName,
        params.fileSize,
        params.mimeType,
        params.fileData,
        params.description
      );
    },
    onSuccess: (res) => {
      if (res.success) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCoverLetters(cleanEmail) });
      }
    },
  });
}

export function useDeleteCoverLetterMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async (id: number) => {
      return deleteUserCoverLetter(id);
    },
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCoverLetters(cleanEmail) });
      }
    },
  });
}

export function useSaveAvatarMutation(userEmail?: string | null) {
  const queryClient = useQueryClient();
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!cleanEmail) throw new Error("User email required");
      const result = await saveUserAvatar(cleanEmail, file);
      if ("error" in result) throw new Error(result.error);
      return result.path;
    },
    onSuccess: (path) => {
      void queryClient.invalidateQueries({ queryKey: ['avatar-url', path] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(cleanEmail) });
    },
  });
}
