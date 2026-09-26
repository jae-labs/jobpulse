-- ==============================================================================
-- Migration: 20260901000002_rls_initplan_optimization.sql
--
-- Purpose: Force Postgres to evaluate public.is_authorized_user() as an
-- InitPlan (once per statement) rather than per-row by wrapping every call
-- in a scalar subquery:  (SELECT public.is_authorized_user())
--
-- Also adds PARALLEL SAFE to the function so the planner can make better use
-- of parallel scans when the result is hoisted.
--
-- Approach: DROP + RECREATE all affected policies (ALTER POLICY cannot change
-- the USING / WITH CHECK expressions on existing policies).
--
-- Policies that use only auth.uid() / auth.jwt() without is_authorized_user()
-- are intentionally left untouched (service_role full-access policies, etc.).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Recreate is_authorized_user() with PARALLEL SAFE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_authorized_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- ==============================================================================
-- 1. Shared Catalog — jobs
-- ==============================================================================
DROP POLICY IF EXISTS "Authorized users can read jobs" ON public.jobs;
CREATE POLICY "Authorized users can read jobs"
  ON public.jobs FOR SELECT
  TO authenticated
  USING ((SELECT public.is_authorized_user()));

-- ==============================================================================
-- 2. Shared Catalog — sources
-- ==============================================================================
DROP POLICY IF EXISTS "Authorized users can read sources" ON public.sources;
CREATE POLICY "Authorized users can read sources"
  ON public.sources FOR SELECT
  TO authenticated
  USING ((SELECT public.is_authorized_user()));

-- ==============================================================================
-- 3. Shared Catalog — employers
-- ==============================================================================
DROP POLICY IF EXISTS "Authorized users can read employers" ON public.employers;
CREATE POLICY "Authorized users can read employers"
  ON public.employers FOR SELECT
  TO authenticated
  USING ((SELECT public.is_authorized_user()));

-- ==============================================================================
-- 4. User Profiles
-- ==============================================================================
DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
CREATE POLICY "Users read own profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users insert own profile" ON public.user_profiles;
CREATE POLICY "Users insert own profile" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;
CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users delete own profile" ON public.user_profiles;
CREATE POLICY "Users delete own profile" ON public.user_profiles
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

-- ==============================================================================
-- 5. User CVs
-- ==============================================================================
DROP POLICY IF EXISTS "Users read own cv" ON public.user_cvs;
CREATE POLICY "Users read own cv" ON public.user_cvs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users insert own cv" ON public.user_cvs;
CREATE POLICY "Users insert own cv" ON public.user_cvs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users update own cv" ON public.user_cvs;
CREATE POLICY "Users update own cv" ON public.user_cvs
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users delete own cv" ON public.user_cvs;
CREATE POLICY "Users delete own cv" ON public.user_cvs
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

-- ==============================================================================
-- 6. User Cover Letters
-- ==============================================================================
DROP POLICY IF EXISTS "Users read own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users read own cover letter" ON public.user_cover_letters
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users insert own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users insert own cover letter" ON public.user_cover_letters
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users update own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users update own cover letter" ON public.user_cover_letters
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users delete own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users delete own cover letter" ON public.user_cover_letters
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

-- ==============================================================================
-- 7. User Job Statuses
-- ==============================================================================
DROP POLICY IF EXISTS "Users read own statuses" ON public.user_job_statuses;
CREATE POLICY "Users read own statuses" ON public.user_job_statuses
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users insert own statuses" ON public.user_job_statuses;
CREATE POLICY "Users insert own statuses" ON public.user_job_statuses
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users update own statuses" ON public.user_job_statuses;
CREATE POLICY "Users update own statuses" ON public.user_job_statuses
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users delete own job statuses" ON public.user_job_statuses;
CREATE POLICY "Users delete own job statuses" ON public.user_job_statuses
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

-- ==============================================================================
-- 8. User Job Evaluations
-- ==============================================================================
DROP POLICY IF EXISTS "Users read own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users read own evaluations" ON public.user_job_evaluations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users insert own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users insert own evaluations" ON public.user_job_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users update own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users update own evaluations" ON public.user_job_evaluations
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Users delete own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users delete own evaluations" ON public.user_job_evaluations
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_authorized_user()) AND (
      user_id = auth.uid() OR
      (user_id IS NULL AND lower(user_email) = lower(auth.jwt() ->> 'email'))
    )
  );

-- ==============================================================================
-- 9. Storage Objects (user-documents bucket)
-- ==============================================================================
DROP POLICY IF EXISTS "Users can only view own storage documents" ON storage.objects;
CREATE POLICY "Users can only view own storage documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'user-documents'
  AND (SELECT public.is_authorized_user())
  AND (
    split_part(name, '/', 1) = auth.uid()::text OR
    lower(split_part(name, '/', 1)) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can only upload own storage documents" ON storage.objects;
CREATE POLICY "Users can only upload own storage documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'user-documents'
  AND (SELECT public.is_authorized_user())
  AND (
    split_part(name, '/', 1) = auth.uid()::text OR
    lower(split_part(name, '/', 1)) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can only update own storage documents" ON storage.objects;
CREATE POLICY "Users can only update own storage documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'user-documents'
  AND (SELECT public.is_authorized_user())
  AND (
    split_part(name, '/', 1) = auth.uid()::text OR
    lower(split_part(name, '/', 1)) = lower(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  bucket_id = 'user-documents'
  AND (SELECT public.is_authorized_user())
  AND (
    split_part(name, '/', 1) = auth.uid()::text OR
    lower(split_part(name, '/', 1)) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can only delete own storage documents" ON storage.objects;
CREATE POLICY "Users can only delete own storage documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'user-documents'
  AND (SELECT public.is_authorized_user())
  AND (
    split_part(name, '/', 1) = auth.uid()::text OR
    lower(split_part(name, '/', 1)) = lower(auth.jwt() ->> 'email')
  )
);
