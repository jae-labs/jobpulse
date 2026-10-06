import { useMemo } from 'react';
import { commitJobTrackingUpdate, projectJob, projectJobPage, projectJobPages, useJobTrackingUpdates, type JobTrackingUpdate } from './jobTrackingUpdates';
import { resolveScoringRules } from '../lib/scoringRules';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type QueryClient } from "@tanstack/react-query";
import { supabase, getAccountClient } from "../lib/supabase";
import type { Job, JobStatus, OverviewMetrics, JobsPageParams, JobsPageResult, Employer, EmployerSize } from "../types/job";
import { getCurrentUserId } from "../lib/userSession";
import { candidateEvaluationFields } from "../lib/candidateEvaluation";
import { queryKeys } from "../lib/queryKeys";
import { validateJobMapResult, validateOverviewMetrics, validateJobsPageResult } from '../lib/rpcValidation';
import { withActiveUser } from './withActiveUser';
import { jobsRpcArgs } from '../lib/jobsRpcArgs';

async function reconcileJobTracking(client: QueryClient, userId: string | null | undefined, update: JobTrackingUpdate, error: unknown) {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.jobById(update.job.id, userId) }),
    client.invalidateQueries({ queryKey: queryKeys.jobsPage(userId) }),
    client.invalidateQueries({ queryKey: queryKeys.jobsSearchPage(userId) }),
    client.invalidateQueries({ queryKey: queryKeys.jobMap(userId) }),
    client.invalidateQueries({ queryKey: queryKeys.overviewMetrics(userId) }),
  ]);
  // A failed refresh must not undo a write the server already confirmed.
  if (!error) await withActiveUser(userId, async () => commitJobTrackingUpdate(client, userId!, update));
}

export interface JobDetailResult {
  description?: string;
  ai_analysis?: Job['ai_analysis'];
  relevance: number;
  fit_tier?: string;
  employer?: Employer | null;
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

  const updates = useJobTrackingUpdates(activeUserId);
  const query = useQuery({
    queryKey: queryKeys.jobsSearchPage(activeUserId, params),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async ({ signal }): Promise<JobsPageResult> => withActiveUser(activeUserId, async () => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }
      const { data, error } = await supabase.rpc("get_jobs_page", jobsRpcArgs(params)).abortSignal(signal);

      if (error) throw new Error(error.message);
      return validateJobsPageResult(data);
    }),
    refetchInterval: 120_000,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
  const data = useMemo(() => query.data ? projectJobPage(query.data, params, updates) : query.data, [query.data, params, updates]);
  return { ...query, data };
}

export function useJobsInfiniteQuery(
  activeUserId?: string | null,
  params: Omit<JobsPageParams, 'limit' | 'offset'> = {},
  enabled = true
) {
  const PAGE_LIMIT = 40;

  const updates = useJobTrackingUpdates(activeUserId);
  const query = useInfiniteQuery({
    queryKey: queryKeys.jobsPage(activeUserId, params),
    initialPageParam: 0,
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async ({ pageParam, signal }): Promise<JobsPageResult> => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error('Supabase is not initialized. Check your environment variables.');
      const { data, error } = await supabase.rpc('get_jobs_page', jobsRpcArgs(params, PAGE_LIMIT, pageParam)).abortSignal(signal);
      if (error) throw new Error(error.message);
      return validateJobsPageResult(data);
    }),
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return fetched < lastPage.total ? fetched : undefined;
    },
    // Avoid refetching every retained page during passive polling or focus.
    // Explicit refresh, mutations, and completed scoring revisions own invalidation.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2,
  });
  const data = useMemo(() => query.data ? projectJobPages(query.data, params, updates) : query.data, [query.data, params, updates]);
  return { ...query, data };
}

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
    queryFn: async (): Promise<JobDetailResult> => withActiveUser(activeUserId, async () => {
      if (!supabase || !jobId) throw new Error("Supabase is not initialized or invalid jobId");
      const userId = activeUserId ? await getCurrentUserId() : null;

      const [jobRes, evalRes, profileRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("description, employer_id, employers(id, name, sector, size, website, employer_offices(place_id, name, address, city, country_code))")
          .eq("id", jobId)
          .maybeSingle(),
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
      const fields = candidateEvaluationFields(evalRes.data, resolveScoringRules(profileRes.data?.scoring_rules));

      const rawEmployer = jobRes.data?.employers;
      const employer: Employer | null = rawEmployer
        ? {
            id: rawEmployer.id,
            name: rawEmployer.name,
            sector: rawEmployer.sector,
            size: rawEmployer.size as EmployerSize | null,
            website: rawEmployer.website,
            careers_url: '',
            offices: Array.isArray(rawEmployer.employer_offices)
              ? rawEmployer.employer_offices.map((o) => ({
                  place_id: o.place_id,
                  name: o.name,
                  address: o.address,
                  city: o.city,
                  country_code: o.country_code,
                }))
              : [],
          }
        : null;

      return {
        description: jobRes.data?.description ?? undefined,
        ai_analysis: fields.ai_analysis,
        relevance: fields.relevance,
        fit_tier: fields.fit_tier,
        employer,
      };
    }),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useJobByIdQuery(jobId?: number | null, activeUserId?: string | null, enabled = true) {
  const updates = useJobTrackingUpdates(activeUserId);
  const query = useQuery({
    queryKey: queryKeys.jobById(jobId, activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && Boolean(jobId) && enabled,
    queryFn: async (): Promise<Job | null> => withActiveUser(activeUserId, async () => {
      if (!supabase || !jobId) return null;
      const userId = activeUserId ? await getCurrentUserId() : null;
      const [jobResult, statusResult, evaluationResult, profileResult] = await Promise.all([
        supabase.from('jobs').select('*, employers(sector, metadata_source)').eq('id', jobId).maybeSingle(),
        userId
          ? supabase.from('user_job_statuses').select('status,is_saved').eq('job_id', jobId).eq('user_id', userId).maybeSingle()
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
        sector: jobResult.data.employers && ['curated', 'verified', 'watchlist'].includes(jobResult.data.employers.metadata_source)
          ? jobResult.data.employers.sector || 'Uncategorized' : 'Uncategorized',
        latitude: ['posting', 'geocoded'].includes(jobResult.data.coordinate_source ?? '') ? jobResult.data.latitude : null,
        longitude: ['posting', 'geocoded'].includes(jobResult.data.coordinate_source ?? '') ? jobResult.data.longitude : null,
        last_seen_at: jobResult.data.last_seen_at ?? new Date().toISOString(),
        ...candidateEvaluationFields(evaluation, resolveScoringRules(profileResult.data?.scoring_rules)),
        status: (statusResult.data?.status === 'interested' ? 'new' : statusResult.data?.status ?? 'new') as JobStatus,
        is_saved: statusResult.data?.is_saved === true || statusResult.data?.status === 'interested',
      };
    }),
    staleTime: 1000 * 60 * 10,
  });
  const data = useMemo(() => query.data ? projectJob(query.data, updates) : query.data, [query.data, updates]);
  return { ...query, data };
}

export function useUpdateJobStatusMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: queryKeys.jobTrackingMutations(activeUserId),
    scope: { id: `status-${activeUserId}` },
    mutationFn: async ({ job, status }: { job: Job; status: JobStatus }) => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error("Supabase client is not configured");
      if (!activeUserId) throw new Error("Active user session required");
      const userId = activeUserId;

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
    onSuccess: (_data, update) => withActiveUser(activeUserId, async () => {
      commitJobTrackingUpdate(queryClient, activeUserId!, update);
    }),
    onSettled: (_data, error, update) => reconcileJobTracking(queryClient, activeUserId, update, error),
  });
}

export function useJobMapQuery(userId: string | null | undefined, params: import('../types/job').JobsPageParams,
  bounds: number[], zoom: number) {
  return useQuery({
    queryKey: queryKeys.jobMap(userId, { ...params, bounds, zoom }),
    enabled: Boolean(supabase) && Boolean(userId),
    queryFn: ({ signal }) => withActiveUser(userId, async () => {
      if (!supabase) throw new Error('Supabase is not initialized');
      const { data, error } = await supabase.rpc('get_job_map', {
        p_status: params.status || 'all', p_sector: params.sector || 'all', p_min_match: params.minMatch || 0,
        p_location: params.location || 'all', p_salary: params.salary || 'all', p_search: params.search || undefined,
        p_bounds: bounds, p_zoom: zoom,
      }).abortSignal(signal);
      if (error) throw new Error(error.message);
      return validateJobMapResult(data);
    }),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
}

export function useJobMapPreviewQuery(userId: string | null | undefined, ids: number[]) {
  return useQuery({
    queryKey: queryKeys.jobMapPreview(userId, ids),
    enabled: Boolean(supabase && userId && ids.length),
    queryFn: ({ signal }) => withActiveUser(userId, async () => {
      if (!supabase) throw new Error('Supabase is not initialized');
      if (ids.length > 5 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid map selection');
      const { data, error } = await supabase.from('jobs').select('id,title,company,location').in('id', ids).abortSignal(signal);
      if (error) throw new Error(error.message);
      const labels = new Map((data ?? []).map((job) => [job.id, job]));
      return ids.flatMap((id) => labels.has(id) ? [labels.get(id)!] : []);
    }),
    staleTime: 120_000,
  });
}

export function useUpdateJobSavedMutation(activeUserId?: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.jobTrackingMutations(activeUserId),
    scope: { id: `is_saved-${activeUserId}` },
    mutationFn: ({ job, saved }: { job: Job; saved: boolean }) => withActiveUser(activeUserId, async () => {
      if (!supabase) throw new Error('Supabase client is not configured');
      const client = await getAccountClient(activeUserId!);
      const { error } = await client.rpc('set_job_saved', { p_job_id: job.id, p_saved: saved });
      if (error) throw new Error('Bookmark update failed');
    }),
    onSuccess: (_data, update) => withActiveUser(activeUserId, async () => {
      commitJobTrackingUpdate(client, activeUserId!, update);
    }),
    onSettled: (_data, error, update) => reconcileJobTracking(client, activeUserId, update, error),
  });
}
