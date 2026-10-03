-- @tenant-fixtures
-- Tracking belongs to a candidate, never the shared vacancy.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='status') THEN
    RAISE EXCEPTION 'Shared jobs still contain status';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    RAISE EXCEPTION 'Unused authorization alias remains';
  END IF;
  IF NOT (SELECT convalidated FROM pg_constraint WHERE conrelid='public.jobs'::regclass AND conname='jobs_salary_amounts_valid') THEN
    RAISE EXCEPTION 'Salary constraint is not validated';
  END IF;
END;
$$;
DELETE FROM public.user_job_statuses WHERE job_id=-910002 AND user_id='a1111111-1111-4111-8111-111111111111';
UPDATE public.user_job_statuses SET status='interviewing' WHERE job_id=-910001 AND user_id='a1111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","email":"tenant-a@example.invalid"}',true);
DO $$
DECLARE item jsonb; metrics jsonb;
BEGIN
  SELECT value INTO item FROM jsonb_array_elements(public.get_jobs_page(p_status=>'interviewing',p_search=>'TenantGuardVacancy',p_limit=>100)->'items') WHERE value->>'id'='-910001';
  IF item IS NULL OR item->>'status'<>'interviewing' THEN RAISE EXCEPTION 'Candidate status missing: %',item; END IF;
  SELECT value INTO item FROM jsonb_array_elements(public.get_jobs_page(p_status=>'new',p_search=>'TenantGuardVacancy',p_limit=>100)->'items') WHERE value->>'id'='-910002';
  IF item IS NULL OR item->>'status'<>'new' THEN RAISE EXCEPTION 'Missing candidate status must default to new: %',item; END IF;
  metrics:=public.get_overview_metrics();
  IF (metrics->'counts'->>'interviewing')::integer<>1 THEN RAISE EXCEPTION 'Candidate overview counts changed: %',metrics; END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.get_jobs_page(p_limit=>100)->'items') item WHERE item->>'status'<>'new') THEN
    RAISE EXCEPTION 'Shared catalog inherited a candidate status';
  END IF;
END;
$$;
ROLLBACK;
