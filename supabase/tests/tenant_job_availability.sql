-- Public availability and private candidate history are independent contracts.
RESET ROLE;
UPDATE public.jobs SET availability_status='unverified',availability_checked_at=NULL,availability_evidence=NULL
 WHERE id IN (-910001,-910002);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 IF public.record_job_availability(-910001,'https://example.invalid/wrong','TenantGuardVacancy','active','published_listing') THEN
  RAISE EXCEPTION 'Changed posting identity accepted'; END IF;
 IF NOT public.record_job_availability(-910001,'https://example.invalid/1','TenantGuardVacancy','closed','explicit_closure') THEN
  RAISE EXCEPTION 'Explicit closure not recorded'; END IF;
 IF public.record_job_availability(-910001,'https://example.invalid/1','TenantGuardVacancy','unverified','acquisition_failed') THEN
  RAISE EXCEPTION 'Request failure erased closure'; END IF;
 IF NOT public.record_job_availability(-910002,'https://example.invalid/2','TenantGuardVacancy','active','published_listing') THEN
  RAISE EXCEPTION 'Published listing not confirmed'; END IF;
 BEGIN
  PERFORM public.record_job_availability(-910002,'https://example.invalid/2','TenantGuardVacancy','closed','acquisition_failed');
  RAISE EXCEPTION 'Failure used as closure evidence';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF public.jobpulse_availability_status('active',now()-interval '24 hours')<>'unverified'
 OR public.jobpulse_availability_status('closed',now()-interval '2 years')<>'closed'
 OR public.jobpulse_availability_status('unverified',now())<>'unverified' THEN
  RAISE EXCEPTION 'Availability age is not uncertainty'; END IF;
 IF (SELECT count(*) FROM public.user_job_statuses WHERE job_id=-910001)<>2
 OR (SELECT count(*) FROM public.user_job_evaluations WHERE job_id=-910001)<>2 THEN
  RAISE EXCEPTION 'Closure destroyed candidate history'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111"}',true);
DO $$ DECLARE page jsonb; pins jsonb; BEGIN
 page:=public.get_jobs_availability_page(p_search=>'TenantGuardVacancy');
 pins:=public.get_job_availability_map(p_search=>'TenantGuardVacancy');
 IF (page->>'total')::int<>1 OR (pins->>'total')::int<>1
 OR page->'items'->0->>'availability_status'<>'active' THEN
  RAISE EXCEPTION 'Active list/map scopes differ'; END IF;
 page:=public.get_jobs_availability_page(p_search=>'TenantGuardVacancy',p_offset=>9999);
 IF (page->>'total')::int<>1 OR jsonb_array_length(page->'items')<>0 THEN
  RAISE EXCEPTION 'Empty high-offset page lost count'; END IF;
 page:=public.get_jobs_availability_page(p_status=>'applied',p_search=>'TenantGuardVacancy',p_availability=>'all');
 IF (page->>'total')::int<>1 OR page->'items'->0->>'status'<>'applied'
 OR page->'items'->0->>'availability_status'<>'closed'
 OR page::text LIKE '%private-marker-b%' THEN RAISE EXCEPTION 'Owner history unavailable or foreign data leaked'; END IF;
 BEGIN
  PERFORM public.record_job_availability(-910001,'https://example.invalid/1','TenantGuardVacancy','active','published_listing');
  RAISE EXCEPTION 'Browser can forge evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.get_jobs_availability_page(p_availability=>'invalid');
  RAISE EXCEPTION 'Invalid filter accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.get_active_overview_metrics();
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222"}',true);
DO $$ DECLARE page jsonb; BEGIN
 page:=public.get_jobs_availability_page(p_status=>'interviewing',p_search=>'TenantGuardVacancy',p_availability=>'all');
 IF (page->>'total')::int<>1 OR page::text LIKE '%private-marker-a%' THEN
  RAISE EXCEPTION 'Second authorized member history isolation failed'; END IF;
 BEGIN
  PERFORM public.record_job_availability(-910001,'https://example.invalid/1','TenantGuardVacancy','active','published_listing');
  RAISE EXCEPTION 'Second member can forge evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_availability_page(); RAISE EXCEPTION 'Uninvited read allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.get_job_availability_map(); RAISE EXCEPTION 'Uninvited map allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.get_active_overview_metrics(); RAISE EXCEPTION 'Uninvited metrics allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d4444444-4444-4444-8444-444444444444"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_availability_page(); RAISE EXCEPTION 'Unconfirmed read allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_availability_page(); RAISE EXCEPTION 'Anonymous read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_job_availability_map(); RAISE EXCEPTION 'Anonymous map allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_active_overview_metrics(); RAISE EXCEPTION 'Anonymous metrics allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.record_job_availability(-910001,'https://example.invalid/1','TenantGuardVacancy','active','published_listing'); RAISE EXCEPTION 'Anonymous evidence allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- A detail body update cannot reopen a closed job; a live fenced listing can.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.crawl_tasks(source_key,target,status,lease_token,lease_until)
 VALUES('synthetic:availability-detail','{"kind":"detail","job_id":-910001}','running','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '1 minute');
DO $$ DECLARE task_id uuid; BEGIN
 SELECT id INTO task_id FROM public.crawl_tasks WHERE source_key='synthetic:availability-detail';
 PERFORM public.persist_crawl_jobs(task_id,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '[{"job":{"dedupe_key":"tenant-guard-job-one","title":"TenantGuardVacancy","company":"Fixture","description":"Synthetic description","url":"https://example.invalid/1","source":"test"},"external_id":"availability-one"}]');
 IF (SELECT availability_status FROM public.jobs WHERE id=-910001)<>'closed'
 OR (SELECT closed_at FROM public.jobs WHERE id=-910001) IS NULL THEN RAISE EXCEPTION 'Detail update reopened closed posting'; END IF;
 UPDATE public.crawl_tasks SET target='{"kind":"source"}' WHERE id=task_id;
 PERFORM public.persist_crawl_jobs(task_id,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '[{"job":{"dedupe_key":"tenant-guard-job-one","title":"TenantGuardVacancy","company":"Fixture","description":"Synthetic description","url":"https://example.invalid/1","source":"test"},"external_id":"availability-one"}]');
 IF (SELECT availability_status FROM public.jobs WHERE id=-910001)<>'active'
 OR (SELECT closed_at FROM public.jobs WHERE id=-910001) IS NOT NULL THEN RAISE EXCEPTION 'Fenced source does not confirm current listing'; END IF;
END $$;
RESET ROLE;
