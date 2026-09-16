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
      return data as unknown as OverviewMetrics;
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
      return data as unknown as JobsPageResult;
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
      return data as unknown as JobsPageResult;
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
      const { data, error } = await supabase
        .from("user_job_evaluations")
        .select("relevance, fit_tier, matched_skills, ai_analysis, jobs!inner(id, title, company, location, employment_type, salary_text, url, source, status, last_seen_at, role_domain, seniority_level)")
        .eq("user_email", cleanEmail)
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

      const [jobRes, evalRes] = await Promise.all([
        supabase.from("jobs").select("description, ai_analysis").eq("id", jobId).maybeSingle(),
        cleanEmail
          ? supabase
              .from("user_job_evaluations")
              .select("ai_analysis")
              .eq("job_id", jobId)
              .eq("user_email", cleanEmail)
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
      const [jobResult, statusResult, evaluationResult] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', jobId).maybeSingle(),
        cleanEmail
          ? supabase.from('user_job_statuses').select('status').eq('job_id', jobId).eq('user_email', cleanEmail).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        cleanEmail
          ? supabase.from('user_job_evaluations').select('relevance, fit_tier, matched_skills, ai_analysis').eq('job_id', jobId).eq('user_email', cleanEmail).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (jobResult.error) throw new Error(jobResult.error.message);
      if (statusResult.error) throw new Error(statusResult.error.message);
      if (evaluationResult.error) throw new Error(evaluationResult.error.message);
      if (!jobResult.data) return null;
      const evaluation = evaluationResult.data;
      return {
        ...jobResult.data,
        status: statusResult.data?.status ?? jobResult.data.status ?? 'new',
        relevance: evaluation?.relevance ?? jobResult.data.relevance,
        fit_tier: evaluation?.fit_tier ?? jobResult.data.fit_tier,
        matched_skills: evaluation?.matched_skills ?? jobResult.data.matched_skills,
        ai_analysis: evaluation?.ai_analysis ?? jobResult.data.ai_analysis,
      } as unknown as Job;
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

      const { error } = await supabase.from("user_job_statuses").upsert(
        {
          user_email: cleanEmail,
          job_id: job.id,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_email,job_id" }
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
      return result.url;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(cleanEmail) });
    },
  });
}
