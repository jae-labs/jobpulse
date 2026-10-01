/** Shared TanStack Query keys used by hooks and profile synchronization. */
export const queryKeys = {
  scoringState: (userId?: string | null) => ["scoring-state", userId ?? null] as const,
  overviewMetrics: (userId?: string | null) => ["overview-metrics", userId ?? null] as const,
  jobsPage: (userId?: string | null, params?: unknown) => ["jobs-page", userId ?? null, ...(params === undefined ? [] : [params])] as const,
  jobsSearchPage: (userId?: string | null, params?: unknown) => ["jobs-search-page", userId ?? null, ...(params === undefined ? [] : [params])] as const,
  scoringPreviewJobs: (userId?: string | null) => ["scoring-preview-jobs", userId ?? null] as const,
  jobById: (id?: number | null, userId?: string | null) => ["job-by-id", id, userId ?? null] as const,
  jobDetail: (id?: number | null, userId?: string | null) => ["job-detail", id, userId ?? null] as const,
  avatarUrl: (path?: string | null) => ["avatar-url", path ?? null] as const,
  sources: () => ["sources"] as const,
  profile: (userId?: string | null) => ["profile", userId ?? null] as const,
  userCvs: (userId?: string | null) => ["user-cvs", userId ?? null] as const,
  userCoverLetters: (userId?: string | null) => ["user-cover-letters", userId ?? null] as const,
  invitations: (userId?: string | null) => ["invitations", userId ?? null] as const,
};
