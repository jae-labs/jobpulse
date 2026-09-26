-- ==============================================================================
-- Migration: Complete migration from legacy user_email to immutable user_id (UUID)
-- Binds candidate tables strictly to auth.users(id) and drops legacy user_email columns.
-- ==============================================================================

-- 1. UPDATE TRIGGER set_user_id_from_auth()
CREATE OR REPLACE FUNCTION public.set_user_id_from_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    NEW.user_id := (SELECT auth.uid());
  ELSE
    IF NEW.user_id IS NULL THEN NEW.user_id := auth.uid(); END IF;
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Active Auth user required';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. BACKFILL AND CLEANUP ORPHAN ROWS
UPDATE public.user_profiles p
SET user_id = u.id
FROM auth.users u
WHERE p.user_id IS NULL AND lower(p.user_email) = lower(u.email);

UPDATE public.user_job_statuses s
SET user_id = u.id
FROM auth.users u
WHERE s.user_id IS NULL AND lower(s.user_email) = lower(u.email);

UPDATE public.user_job_evaluations e
SET user_id = u.id
FROM auth.users u
WHERE e.user_id IS NULL AND lower(e.user_email) = lower(u.email);

UPDATE public.user_cvs c
SET user_id = u.id
FROM auth.users u
WHERE c.user_id IS NULL AND lower(c.user_email) = lower(u.email);

UPDATE public.user_cover_letters l
SET user_id = u.id
FROM auth.users u
WHERE l.user_id IS NULL AND lower(l.user_email) = lower(u.email);

-- Remove orphan rows that have no valid auth.users binding
DELETE FROM public.user_profiles WHERE user_id IS NULL;
DELETE FROM public.user_job_statuses WHERE user_id IS NULL;
DELETE FROM public.user_job_evaluations WHERE user_id IS NULL;
DELETE FROM public.user_cvs WHERE user_id IS NULL;
DELETE FROM public.user_cover_letters WHERE user_id IS NULL;

-- 3. DROP DEPENDENT POLICIES BEFORE DROPPING COLUMNS
DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users delete own profile" ON public.user_profiles;

DROP POLICY IF EXISTS "Users read own statuses" ON public.user_job_statuses;
DROP POLICY IF EXISTS "Users insert own statuses" ON public.user_job_statuses;
DROP POLICY IF EXISTS "Users update own statuses" ON public.user_job_statuses;
DROP POLICY IF EXISTS "Users delete own job statuses" ON public.user_job_statuses;

DROP POLICY IF EXISTS "Users read own evaluations" ON public.user_job_evaluations;
DROP POLICY IF EXISTS "Users insert own evaluations" ON public.user_job_evaluations;
DROP POLICY IF EXISTS "Users update own evaluations" ON public.user_job_evaluations;
DROP POLICY IF EXISTS "Users delete own evaluations" ON public.user_job_evaluations;

DROP POLICY IF EXISTS "Users read own cv" ON public.user_cvs;
DROP POLICY IF EXISTS "Users insert own cv" ON public.user_cvs;
DROP POLICY IF EXISTS "Users update own cv" ON public.user_cvs;
DROP POLICY IF EXISTS "Users delete own cv" ON public.user_cvs;

DROP POLICY IF EXISTS "Users read own cover letter" ON public.user_cover_letters;
DROP POLICY IF EXISTS "Users insert own cover letter" ON public.user_cover_letters;
DROP POLICY IF EXISTS "Users update own cover letter" ON public.user_cover_letters;
DROP POLICY IF EXISTS "Users delete own cover letter" ON public.user_cover_letters;

-- 4. HARDEN USER_PROFILES
ALTER TABLE public.user_profiles ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS check_user_profiles_email_lowercase;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_email_key;
DROP INDEX IF EXISTS public.idx_user_profiles_user_email;
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS user_email;

-- 5. HARDEN USER_JOB_STATUSES
ALTER TABLE public.user_job_statuses ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_job_statuses DROP CONSTRAINT IF EXISTS user_job_statuses_user_email_job_id_key;
ALTER TABLE public.user_job_statuses DROP CONSTRAINT IF EXISTS check_user_job_statuses_email_lowercase;
DROP INDEX IF EXISTS public.idx_user_job_statuses_user_email;
DROP INDEX IF EXISTS public.idx_user_job_statuses_email_job;
DROP INDEX IF EXISTS public.uq_user_job_statuses_user_id_job;
ALTER TABLE public.user_job_statuses DROP COLUMN IF EXISTS user_email;

-- 6. HARDEN USER_JOB_EVALUATIONS
ALTER TABLE public.user_job_evaluations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_job_evaluations DROP CONSTRAINT IF EXISTS user_job_evaluations_user_email_job_id_key;
ALTER TABLE public.user_job_evaluations DROP CONSTRAINT IF EXISTS check_user_job_evaluations_email_lowercase;
DROP INDEX IF EXISTS public.idx_user_job_evaluations_user_email;
DROP INDEX IF EXISTS public.idx_user_job_evaluations_email_job;
ALTER TABLE public.user_job_evaluations DROP COLUMN IF EXISTS user_email;

-- 7. HARDEN USER_CVS
ALTER TABLE public.user_cvs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_cvs DROP CONSTRAINT IF EXISTS check_user_cvs_email_lowercase;
DROP INDEX IF EXISTS public.idx_user_cvs_user_email;
ALTER TABLE public.user_cvs DROP COLUMN IF EXISTS user_email;

-- 8. HARDEN USER_COVER_LETTERS
ALTER TABLE public.user_cover_letters ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_cover_letters DROP CONSTRAINT IF EXISTS check_user_cover_letters_email_lowercase;
DROP INDEX IF EXISTS public.idx_user_cover_letters_user_email;
ALTER TABLE public.user_cover_letters DROP COLUMN IF EXISTS user_email;

-- 9. CREATE NEW STANDARDIZED RLS POLICIES BOUND TO AUTH.UID()
-- user_profiles
CREATE POLICY "Users read own profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users insert own profile" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own profile" ON public.user_profiles
  FOR DELETE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

-- user_job_statuses
CREATE POLICY "Users read own statuses" ON public.user_job_statuses
  FOR SELECT TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users insert own statuses" ON public.user_job_statuses
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users update own statuses" ON public.user_job_statuses
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own job statuses" ON public.user_job_statuses
  FOR DELETE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

-- user_job_evaluations
CREATE POLICY "Users read own evaluations" ON public.user_job_evaluations
  FOR SELECT TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users insert own evaluations" ON public.user_job_evaluations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users update own evaluations" ON public.user_job_evaluations
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own evaluations" ON public.user_job_evaluations
  FOR DELETE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

-- user_cvs
CREATE POLICY "Users read own cv" ON public.user_cvs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users insert own cv" ON public.user_cvs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users update own cv" ON public.user_cvs
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own cv" ON public.user_cvs
  FOR DELETE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

-- user_cover_letters
CREATE POLICY "Users read own cover letter" ON public.user_cover_letters
  FOR SELECT TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users insert own cover letter" ON public.user_cover_letters
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users update own cover letter" ON public.user_cover_letters
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own cover letter" ON public.user_cover_letters
  FOR DELETE TO authenticated
  USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));
