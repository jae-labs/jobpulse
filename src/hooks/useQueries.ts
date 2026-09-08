import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Job, Source, Employer, Profile, JobStatus } from "../types/job";
import { DEFAULT_PROFILE } from "../lib/defaultProfile";
import { loadUserProfile, saveUserProfile } from "../lib/userProfile";

export const queryKeys = {
  jobs: (email?: string | null) => ["jobs", email ? email.trim().toLowerCase() : null] as const,
  sources: () => ["sources"] as const,
  employers: () => ["employers"] as const,
  profile: (email?: string | null) => ["profile", email ? email.trim().toLowerCase() : null] as const,
};

export function useJobsQuery(userEmail?: string | null, enabled = true) {
  const cleanEmail = userEmail?.trim().toLowerCase();

  return useQuery({
    queryKey: queryKeys.jobs(cleanEmail),
    enabled: Boolean(supabase) && enabled,
    queryFn: async (): Promise<Job[]> => {
      if (!supabase) {
        throw new Error("Supabase is not initialized. Check your environment variables.");
      }

      const [jobsRes, userStatusesRes] = await Promise.all([
        supabase.from("jobs").select("*").order("relevance", { ascending: false }),
        cleanEmail
          ? supabase.from("user_job_statuses").select("job_id, status").ilike("user_email", cleanEmail)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (jobsRes.error) throw new Error(jobsRes.error.message);

      const statusMap = new Map<number, JobStatus>();
      if (userStatusesRes && "data" in userStatusesRes && userStatusesRes.data) {
        for (const row of userStatusesRes.data as { job_id: number; status: JobStatus }[]) {
          if (row.job_id !== null && row.job_id !== undefined) {
            statusMap.set(Number(row.job_id), row.status as JobStatus);
          }
        }
      }

      const rawJobs = (jobsRes.data || []) as unknown as Job[];
      return rawJobs.map((j: Job) => ({
        ...j,
        status: statusMap.get(j.id) || "new",
      }));
    },
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

      const previousJobs = queryClient.getQueryData<Job[]>(qk);

      if (previousJobs) {
        queryClient.setQueryData<Job[]>(
          qk,
          previousJobs.map((j) => (j.id === job.id ? { ...j, status } : j))
        );
      }

      return { previousJobs, qk };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousJobs && context.qk) {
        queryClient.setQueryData(context.qk, context.previousJobs);
      }
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.qk) {
        void queryClient.invalidateQueries({ queryKey: context.qk });
      }
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
