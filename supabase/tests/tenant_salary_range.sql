-- The expanded salary contract must match across list/map and retain caller-owned scores/statuses.
RESET ROLE;
UPDATE public.jobs SET salary_text='€300,000 annual' WHERE id=-910001;
UPDATE public.jobs SET salary_text='€10,000 annual' WHERE id=-910002;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$
DECLARE threshold integer; expected integer; page jsonb; map jsonb; invalid text;
BEGIN
 FOR threshold IN 1..30 LOOP
  expected:=CASE WHEN threshold=1 THEN 2 ELSE 1 END;
  page:=public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>threshold*10 || 'k');
  map:=public.get_job_map(p_search=>'TenantGuardVacancy',p_salary=>threshold*10 || 'k');
  IF (page->>'total')::integer<>expected OR jsonb_array_length(page->'items')<>expected
    OR (map->>'total')::integer<>expected THEN RAISE EXCEPTION 'Salary list/map mismatch at %k',threshold*10; END IF;
 END LOOP;
 page:=public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>'300k',p_offset=>100);
 IF (page->>'total')::integer<>1 OR page->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'Salary high-offset total lost'; END IF;
 IF (public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>'300k',p_min_match=>90)->>'total')::integer<>0
  OR (public.get_job_map(p_search=>'TenantGuardVacancy',p_salary=>'300k',p_min_match=>90)->>'total')::integer<>0
  OR (public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>'300k',p_status=>'interviewing')->>'total')::integer<>0 THEN
  RAISE EXCEPTION 'Foreign score/status exposed by salary filter'; END IF;
 FOREACH invalid IN ARRAY ARRAY['0k','5k','15k','310k','999999999999999k','010k','10000','10k OR true'] LOOP
  BEGIN PERFORM public.get_jobs_page(p_salary=>invalid); RAISE EXCEPTION 'Invalid salary accepted: %',invalid;
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.get_job_map(p_salary=>invalid); RAISE EXCEPTION 'Invalid map salary accepted: %',invalid;
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","user_metadata":{"user_id":"a1111111-1111-4111-8111-111111111111"}}',true);
DO $$ BEGIN
 IF (public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>'300k',p_min_match=>90,p_status=>'interviewing')->>'total')::integer<>1
  OR (public.get_job_map(p_search=>'TenantGuardVacancy',p_salary=>'300k',p_min_match=>90,p_status=>'interviewing')->>'total')::integer<>1 THEN
  RAISE EXCEPTION 'Caller scores/status lost or forged metadata trusted'; END IF;
END $$;
RESET ROLE;
-- Thresholds are annual EUR only; disclosure remains compatible for other currencies/periods.
UPDATE public.jobs SET salary_text='$300,000 annual' WHERE id=-910001;
UPDATE public.jobs SET salary_text='€300,000 hourly' WHERE id=-910002;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>'10k')->>'total')::integer<>0
  OR (public.get_job_map(p_search=>'TenantGuardVacancy',p_salary=>'10k')->>'total')::integer<>0
  OR (public.get_jobs_page(p_search=>'TenantGuardVacancy',p_salary=>'disclosed')->>'total')::integer<>2 THEN
  RAISE EXCEPTION 'Salary currency/period contract changed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_salary=>'300k'); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Uninvited salary access';
  EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN PERFORM public.get_job_map(p_salary=>'300k'); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Uninvited map salary access';
  EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_salary=>'10k'); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Unconfirmed salary access';
  EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN PERFORM public.get_job_map(p_salary=>'10k'); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Unconfirmed map salary access';
  EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_salary=>'10k'); RAISE EXCEPTION 'Anonymous salary access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_job_map(p_salary=>'10k'); RAISE EXCEPTION 'Anonymous map salary access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
