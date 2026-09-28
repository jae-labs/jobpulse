-- Restore search/recency indexes missing from hosted deployments.
CREATE INDEX IF NOT EXISTS idx_jobs_location ON public.jobs (location);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen_at ON public.jobs (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON public.jobs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_company_trgm ON public.jobs USING gin (company gin_trgm_ops);

-- Candidate rankings are always scoped to one user, never catalog-wide.
DROP INDEX IF EXISTS public.idx_user_job_evaluations_relevance;
CREATE INDEX IF NOT EXISTS idx_user_job_evaluations_user_relevance
  ON public.user_job_evaluations (user_id, relevance DESC);

-- Unique owner/job indexes already cover these lookups and constraints.
DROP INDEX IF EXISTS public.uq_user_job_evaluations_user_id_job;
DROP INDEX IF EXISTS public.uq_user_job_statuses_user_id_job;
DROP INDEX IF EXISTS public.idx_user_job_evaluations_user_id;
DROP INDEX IF EXISTS public.idx_user_job_statuses_user_id;
DROP INDEX IF EXISTS public.idx_user_profiles_user_id;
-- Employer telemetry loads the small catalog without sector/priority filters.
DROP INDEX IF EXISTS public.idx_employers_sector;
DROP INDEX IF EXISTS public.idx_employers_priority;

-- No consumer uses previous-row payloads. Primary keys identify changes.
ALTER TABLE public.jobs REPLICA IDENTITY DEFAULT;
ALTER TABLE public.sources REPLICA IDENTITY DEFAULT;
ALTER TABLE public.employers REPLICA IDENTITY DEFAULT;
ALTER TABLE public.user_profiles REPLICA IDENTITY DEFAULT;
ALTER TABLE public.user_job_statuses REPLICA IDENTITY DEFAULT;

-- service_role already has BYPASSRLS; redundant policies are unnecessary.
DROP POLICY IF EXISTS "Service role full access on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Service role full access on sources" ON public.sources;
DROP POLICY IF EXISTS "Service role full access on employers" ON public.employers;
DROP POLICY IF EXISTS "Service role full access on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role full access on user_cvs" ON public.user_cvs;
DROP POLICY IF EXISTS "Service role full access on user_cover_letters" ON public.user_cover_letters;
DROP POLICY IF EXISTS "Service role full access on user_job_statuses" ON public.user_job_statuses;
DROP POLICY IF EXISTS "Service role full access on user_job_evaluations" ON public.user_job_evaluations;

-- Trigger dispatch does not require public RPC execution privileges.
REVOKE EXECUTE ON FUNCTION public.set_user_id_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_cv_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_cover_letter_limit() FROM PUBLIC, anon, authenticated;

-- Restore the canonical invitation identity constraint missing on hosted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.authorized_users'::regclass
    AND conname='check_authorized_users_email_lowercase') THEN
    ALTER TABLE public.authorized_users ADD CONSTRAINT check_authorized_users_email_lowercase
      CHECK (email = lower(email));
  END IF;
END;
$$;
