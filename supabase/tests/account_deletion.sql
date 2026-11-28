-- Run against a seeded local database. Roll back every deletion.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.authorized_users (email, role, invited_by, status)
VALUES ('deletion-test@example.com', 'member', '11111111-1111-1111-1111-111111111111', 'pending');

DELETE FROM auth.users WHERE id = '11111111-1111-1111-1111-111111111111';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.authorized_users WHERE user_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'deleted user retained access';
  END IF;
  IF EXISTS (SELECT 1 FROM public.authorized_users WHERE invited_by = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'deleted user retained pending invitations';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'deleted user retained profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_job_statuses WHERE user_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'deleted user retained pipeline statuses';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_job_evaluations WHERE user_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'deleted user retained evaluations';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = '11111111-1111-1111-1111-111111111111')
     OR EXISTS (SELECT 1 FROM public.user_cover_letters WHERE user_id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'deleted user retained document metadata';
  END IF;
END;
$$;

ROLLBACK;
