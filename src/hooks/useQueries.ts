import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Job, Source, Employer, Profile, JobStatus, SubScores, OverviewMetrics, JobsPageParams, JobsPageResult } from "../types/job";
import { DEFAULT_PROFILE } from "../lib/defaultProfile";
import { loadUserProfile, saveUserProfile } from "../lib/userProfile";

export const queryKeys = {
  overviewMetrics: (email?: string | null) => ["overview-metrics", email ? email.trim().toLowerCase() : null] as const,
  jobsPage: (email?: string | null, params?: unknown) => ["jobs-page", email ? email.trim().toLowerCase() : null, params] as const,
  jobs: (email?: string | null) => ["jobs", email ? email.trim().toLowerCase() : null] as const,
  jobDetail: (id?: number | null, email?: string | null) => ["job-detail", id, email ? email.trim().toLowerCase() : null] as const,
  jobCount: () => ["job-count"] as const,
  sources: () => ["sources"] as const,
  employers: () => ["employers"] as const,
  profile: (email?: string | null) => ["profile", email ? email.trim().toLowerCase() : null] as const,
};

// Supabase caps each response at 1000 rows by default. Without pagination,
// tables that exceed that (jobs, user_job_evaluations) get silently
// truncated to an arbitrary 1000-row subset per request, so a job present
// in one truncated batch can be missing from another, breaking the join.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any; error: { message: string } | null }>
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows: T[] = data || [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
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
        p_user_email: cleanEmail || null,
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

  return useQuery({
    queryKey: queryKeys.jobsPage(cleanEmail, params),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<JobsPageResult> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_jobs_page", {
        p_user_email: cleanEmail || null,
        p_status: params.status || "all",
        p_domain: params.domain || "all",
        p_min_match: params.minMatch ?? 0,
        p_location: params.location || "all",
        p_salary: params.salary || "all",
        p_search: params.search || null,
        p_sort_by: params.sortBy || "match",
        p_sort_dir: params.sortDir || "desc",
        p_limit: params.limit ?? 40,
        p_offset: params.offset ?? 0,
      });

      if (error) throw new Error(error.message);
      return data as unknown as JobsPageResult;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    placeholderData: (previousData) => previousData,
  });
}

export function useJobsQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.jobs(cleanEmail),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<Job[]> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const client = supabase;

      // Notice: description and ai_analysis are deferred to useJobDetailQuery
      // to avoid downloading megabytes of text across 1,500+ records on initial load.
      const [rawJobsData, userStatuses, userEvals] = await Promise.all([
        fetchAllRows<Job>((from, to) =>
          client
            .from("jobs")
            .select(
              "id, title, company, location, employment_type, salary_text, url, source, relevance, matched_skills, status, last_seen_at, fit_tier, role_domain, seniority_level"
            )
            .range(from, to)
        ),
        cleanEmail
          ? fetchAllRows<{ job_id: number; status: JobStatus }>((from, to) =>
              client.from("user_job_statuses").select("job_id, status").ilike("user_email", cleanEmail).range(from, to)
            )
          : Promise.resolve([]),
        cleanEmail
          ? fetchAllRows<{ job_id: number; relevance: number; fit_tier: string; matched_skills: unknown }>(
              (from, to) =>
                client
                  .from("user_job_evaluations")
                  .select("job_id, relevance, fit_tier, matched_skills")
                  .ilike("user_email", cleanEmail)
                  .range(from, to)
            )
          : Promise.resolve([]),
      ]);

      const statusMap = new Map<number, JobStatus>();
      for (const row of userStatuses) {
        if (row.job_id !== null && row.job_id !== undefined) {
          statusMap.set(Number(row.job_id), row.status);
        }
      }

      const evalMap = new Map<number, { relevance: number; fit_tier: string; matched_skills: string[]; sub_scores?: SubScores }>();
      for (const row of userEvals) {
        if (row.job_id !== null && row.job_id !== undefined) {
          evalMap.set(Number(row.job_id), {
            relevance: Number(row.relevance ?? 0),
            fit_tier: row.fit_tier || 'Unassessed',
            matched_skills: Array.isArray(row.matched_skills) ? (row.matched_skills as string[]) : [],
            sub_scores: (row.sub_scores as unknown as SubScores) || undefined,
          });
        }
      }

      const mappedJobs = rawJobsData.map((j: Job) => {
        const userEval = evalMap.get(j.id);
        return {
          ...j,
          status: statusMap.get(j.id) || "new",
          relevance: userEval ? userEval.relevance : (cleanEmail ? 0 : j.relevance),
          fit_tier: userEval ? userEval.fit_tier : (cleanEmail ? 'Unassessed' : j.fit_tier),
          matched_skills: userEval ? userEval.matched_skills : (cleanEmail ? [] : j.matched_skills),
          sub_scores: userEval?.sub_scores,
        };
      });

      return mappedJobs.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    },
  });
}

export function useJobDetailQuery(jobId?: number | null, userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.jobDetail(jobId, cleanEmail),
    enabled: Boolean(supabase) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<{ description?: string; ai_analysis?: any }> => {
      if (!supabase || !jobId) throw new Error("Supabase is not initialized or invalid jobId");

      const [jobRes, evalRes] = await Promise.all([
        supabase.from("jobs").select("description, ai_analysis").eq("id", jobId).single(),
        cleanEmail
          ? supabase
              .from("user_job_evaluations")
              .select("ai_analysis")
              .eq("job_id", jobId)
              .ilike("user_email", cleanEmail)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (jobRes.error) throw new Error(jobRes.error.message);

      const aiAnalysis = evalRes.data?.ai_analysis || jobRes.data?.ai_analysis;

      return {
        description: jobRes.data?.description ?? undefined,
        ai_analysis: aiAnalysis ?? undefined,
      };
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
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
      const { data, error } = await supabase.from("sources").select("*").order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as Source[];
    },
  });
}

export function useEmployersQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.employers(),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<Employer[]> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized.");
      }
      const { data, error } = await supabase.from("employers").select("*").order("priority", { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as Employer[];
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
      await queryClient.cancelQueries({ queryKey: ['jobs-page'] });

      const previousJobs = queryClient.getQueryData<Job[]>(qk);

      if (previousJobs) {
        queryClient.setQueryData<Job[]>(
          qk,
          previousJobs.map((j) => (j.id === job.id ? { ...j, status } : j))
        );
      }

      queryClient.setQueriesData<JobsPageResult>(
        { queryKey: ['jobs-page'] },
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
      void queryClient.invalidateQueries({ queryKey: ['jobs-page'] });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.qk) {
        void queryClient.invalidateQueries({ queryKey: context.qk });
      }
      void queryClient.invalidateQueries({ queryKey: ['jobs-page'] });
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
