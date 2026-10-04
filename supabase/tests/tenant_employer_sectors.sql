-- Shared catalog sectors never rewrite private assessments or leak foreign scores.
INSERT INTO public.employers(id,name,sector,careers_url,metadata_source)
VALUES (-980501,'Synthetic Sector Employer','Synthetic Sector','https://example.invalid/careers','verified');
UPDATE public.jobs SET employer_id=-980501,latitude=53,longitude=-6,coordinate_source=NULL
WHERE id=-910001;
UPDATE public.jobs SET employer_id=-980501,latitude=0,longitude=0,coordinate_source='posting'
WHERE id=-910002;
UPDATE public.user_job_evaluations SET ai_analysis='{"role_sector":"General"}'
WHERE user_id='a1111111-1111-4111-8111-111111111111' AND job_id=-910001;

CREATE FUNCTION pg_temp.assert_sector_contract(own_score integer, own_status text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE metrics jsonb; category jsonb; page jsonb;
BEGIN
 metrics:=public.get_overview_metrics();
 FOR category IN SELECT value FROM jsonb_array_elements(metrics->'categories') LOOP
  page:=public.get_jobs_page(p_sector=>category->>'name');
  IF (page->>'total')::bigint<>(category->>'value')::bigint THEN
   RAISE EXCEPTION 'Sector chart/page populations differ: %', category->>'name';
  END IF;
 END LOOP;
 FOR category IN SELECT value FROM jsonb_array_elements(metrics->'categories') LOOP
  page:=public.get_jobs_page(p_sector=>category->>'name');
  IF (page->>'total')::bigint<>(category->>'value')::bigint THEN
   RAISE EXCEPTION 'Sector chart/page populations differ: %', category->>'name';
  END IF;
 END LOOP;
 SELECT value INTO category FROM jsonb_array_elements(metrics->'categories') WHERE value->>'name'='Synthetic Sector';
 IF (category->>'value')::integer<>2 OR (category->>'avgMatch')::integer<>own_score THEN
  RAISE EXCEPTION 'Sector averages included unassessed or foreign scores';
 END IF;
 IF false THEN
  RAISE EXCEPTION 'Unexpected duplicate sector aggregate';
 END IF;
 page:=public.get_jobs_page(p_sector=>'Synthetic Sector',p_sort_by=>'title',p_offset=>100);
 IF page->'items'<>'[]'::jsonb OR (page->>'total')::integer<>2 THEN
  RAISE EXCEPTION 'Sector high-offset page lost total';
 END IF;
 page:=public.get_jobs_page(p_search=>'TenantGuardVacancy',p_sector=>'Synthetic Sector',p_limit=>1,p_offset=>1);
 IF (page->>'total')::integer<>2 OR page->'items'->0->>'id'<>'-910002'
  OR page->'items'->0->>'sector'<>'Synthetic Sector'
  OR page->'items'->0->>'role_sector'<>'Uncategorized'
  OR (page->'items'->0->>'latitude')::numeric<>0 OR (page->'items'->0->>'longitude')::numeric<>0 THEN
  RAISE EXCEPTION 'Unassessed sector or zero posting coordinates lost';
 END IF;
 page:=public.get_jobs_page(p_search=>'TenantGuardVacancy',p_sector=>'Synthetic Sector',p_sort_by=>'match');
 IF (page->'items'->0->>'relevance')::integer<>own_score OR page->'items'->0->>'status'<>own_status
  OR page->'items'->0->'latitude'<>'null'::jsonb OR page->'items'->0->'longitude'<>'null'::jsonb THEN
  RAISE EXCEPTION 'Owner scores/status or unverified coordinate quarantine failed';
 END IF;
 BEGIN
  PERFORM public.get_jobs_page(p_sector=>repeat('x',101));
  RAISE EXCEPTION 'Unbounded sector accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF to_regprocedure('public.evaluate_candidate_job(uuid,bigint,real)') IS NOT NULL THEN
  RAISE EXCEPTION 'Duplicate scoring API survived';
 END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
SELECT pg_temp.assert_sector_contract(11,'applied');
DO $$ BEGIN
 IF public.get_overview_metrics()::text LIKE '%private-marker-b%'
  OR (public.get_jobs_page(p_sector=>'private-marker-b')->>'total')::integer<>0 THEN
  RAISE EXCEPTION 'Sector path disclosed foreign evaluation';
 END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
SELECT pg_temp.assert_sector_contract(97,'interviewing');
DO $$ BEGIN
 IF (public.get_jobs_page(p_search=>'TenantGuardVacancy',p_sector=>'General')->>'total')::integer<>0 THEN
  RAISE EXCEPTION 'Foreign candidate sector survived account switch';
 END IF;
END $$;
-- Untrusted employer sectors never appear as established shared metadata.
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.employers SET metadata_source='unverified',sector='Guessed Private Sector' WHERE id=-980501;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$ BEGIN
 IF public.get_overview_metrics()::text LIKE '%Guessed Private Sector%'
  OR (public.get_jobs_page(p_sector=>'Guessed Private Sector')->>'total')::integer<>0 THEN
  RAISE EXCEPTION 'Unverified sector was published';
 END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_sector=>'Synthetic Sector'); RAISE EXCEPTION 'Uninvited sector access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_overview_metrics(); RAISE EXCEPTION 'Unconfirmed sector access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_sector=>'Synthetic Sector'); RAISE EXCEPTION 'Anonymous sector access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
