-- Bind all new tenant writes to the authenticated user's immutable identity
-- and verified JWT email. Existing legacy rows with a NULL user_id remain
-- readable through the prior compatibility policies until they are migrated.

CREATE OR REPLACE FUNCTION public.current_user_owns_row(row_user_id uuid, row_user_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT row_user_id = auth.uid()
     AND lower(row_user_email) = lower(auth.jwt() ->> 'email');
$$;

-- Repair rows created before the policy fix. Email was the original tenant
-- key, so its matching Auth identity is authoritative for these records.
UPDATE public.user_profiles row
SET user_id = auth_user.id
FROM auth.users auth_user
WHERE lower(row.user_email) = lower(auth_user.email)
  AND row.user_id IS DISTINCT FROM auth_user.id;

UPDATE public.user_job_statuses row
SET user_id = auth_user.id
FROM auth.users auth_user
WHERE lower(row.user_email) = lower(auth_user.email)
  AND row.user_id IS DISTINCT FROM auth_user.id;

UPDATE public.user_job_evaluations row
SET user_id = auth_user.id
FROM auth.users auth_user
WHERE lower(row.user_email) = lower(auth_user.email)
  AND row.user_id IS DISTINCT FROM auth_user.id;

UPDATE public.user_cvs row
SET user_id = auth_user.id
FROM auth.users auth_user
WHERE lower(row.user_email) = lower(auth_user.email)
  AND row.user_id IS DISTINCT FROM auth_user.id;

UPDATE public.user_cover_letters row
SET user_id = auth_user.id
FROM auth.users auth_user
WHERE lower(row.user_email) = lower(auth_user.email)
  AND row.user_id IS DISTINCT FROM auth_user.id;

-- The BEFORE trigger sets a missing user_id to auth.uid(). Requiring both
-- fields here prevents a caller from claiming another user's unique email.
DROP POLICY IF EXISTS "Users insert own profile" ON public.user_profiles;
CREATE POLICY "Users insert own profile" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;
CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  )
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users insert own statuses" ON public.user_job_statuses;
CREATE POLICY "Users insert own statuses" ON public.user_job_statuses
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users update own statuses" ON public.user_job_statuses;
CREATE POLICY "Users update own statuses" ON public.user_job_statuses
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  )
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users insert own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users insert own evaluations" ON public.user_job_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users update own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users update own evaluations" ON public.user_job_evaluations
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  )
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users insert own cv" ON public.user_cvs;
CREATE POLICY "Users insert own cv" ON public.user_cvs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users update own cv" ON public.user_cvs;
CREATE POLICY "Users update own cv" ON public.user_cvs
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  )
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users insert own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users insert own cover letter" ON public.user_cover_letters
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );

DROP POLICY IF EXISTS "Users update own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users update own cover letter" ON public.user_cover_letters
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  )
  WITH CHECK (
    (SELECT public.is_authorized_user())
    AND public.current_user_owns_row(user_id, user_email)
  );
