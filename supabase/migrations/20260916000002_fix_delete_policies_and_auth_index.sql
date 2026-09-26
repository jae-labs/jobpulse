-- Fix M-SEC-3: Use index-friendly equality for is_authorized_user()
-- The authorized_users table already enforces email = lower(email),
-- so we only need to lower() the JWT email side to use the index.
CREATE OR REPLACE FUNCTION public.is_authorized_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE email = lower(auth.jwt() ->> 'email')
  );
$$;

-- Fix H-SEC-1: Update DELETE policies to use strict tenant identity
-- Replace weak legacy DELETE policies with the strict current_user_owns_row() 
-- check introduced in migration 20260914000003.

-- 1. user_profiles
DROP POLICY IF EXISTS "Users delete own profile" ON public.user_profiles;
CREATE POLICY "Users delete own profile" ON public.user_profiles
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

-- 2. user_job_statuses
DROP POLICY IF EXISTS "Users delete own job statuses" ON public.user_job_statuses;
CREATE POLICY "Users delete own job statuses" ON public.user_job_statuses
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

-- 3. user_job_evaluations
DROP POLICY IF EXISTS "Users delete own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users delete own evaluations" ON public.user_job_evaluations
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

-- 4. user_cvs
DROP POLICY IF EXISTS "Users delete own cv" ON public.user_cvs;
CREATE POLICY "Users delete own cv" ON public.user_cvs
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

-- 5. user_cover_letters
DROP POLICY IF EXISTS "Users delete own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users delete own cover letter" ON public.user_cover_letters
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );
