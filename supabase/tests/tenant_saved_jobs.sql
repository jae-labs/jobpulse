-- Bookmark writes derive ownership from verified auth.uid(), never client arguments.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
SELECT public.set_job_saved(-910001,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_job_statuses WHERE job_id=-910001 AND status='applied' AND is_saved) THEN RAISE EXCEPTION 'Saving overwrote progress'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_job_statuses WHERE user_id='b2222222-2222-4222-8222-222222222222') THEN RAISE EXCEPTION 'Foreign bookmark readable'; END IF;
 IF (public.get_jobs_page(p_status=>'saved')->>'total')::integer<>1 THEN RAISE EXCEPTION 'Saved page/count contract'; END IF;
 IF (public.get_job_map(p_status=>'saved')->>'total')::integer<>1 THEN RAISE EXCEPTION 'Saved map/page count mismatch'; END IF;
 IF (public.get_overview_metrics()->'counts'->>'saved')::integer<>1 THEN RAISE EXCEPTION 'Saved overview count'; END IF;
 BEGIN
  UPDATE public.user_job_statuses SET is_saved=true WHERE user_id='b2222222-2222-4222-8222-222222222222';
  IF FOUND THEN RAISE EXCEPTION 'Foreign bookmark writable'; END IF;
 END;
END $$;
SELECT public.set_job_saved(-910001,false);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.user_job_statuses WHERE job_id=-910001 AND status='applied' AND NOT is_saved) THEN RAISE EXCEPTION 'Unsave overwrote progress'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","user_metadata":{"user_id":"a1111111-1111-4111-8111-111111111111"}}',true);
SELECT public.set_job_saved(-910001,true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.user_job_statuses WHERE job_id=-910001 AND status='interviewing' AND is_saved) THEN RAISE EXCEPTION 'Forged metadata changed bookmark owner'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
DO $$ BEGIN BEGIN PERFORM public.set_job_saved(-910001,true); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Uninvited save allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
DO $$ BEGIN BEGIN PERFORM public.set_job_saved(-910001,true); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Unconfirmed save allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.set_job_saved(-910001,true); RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Anonymous save allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.user_job_statuses WHERE user_id='a1111111-1111-4111-8111-111111111111' AND is_saved) THEN RAISE EXCEPTION 'Other member changed A bookmark'; END IF; END $$;
SELECT set_config('request.jwt.claims','{}',true);
-- Catalog deduplication must retain bookmarks on either keeper or duplicate.
INSERT INTO public.jobs(id,dedupe_key,title,company,description,url,source) VALUES
 (-910010,'saved-keeper-fixture','Saved merge keeper','Fixture','Synthetic','https://example.invalid/saved-keeper','fixture'),
 (-910011,'saved-duplicate-fixture','Saved merge duplicate','Fixture','Synthetic','https://example.invalid/saved-duplicate','fixture');
INSERT INTO public.user_job_statuses(user_id,job_id,status,is_saved) VALUES
 ('a1111111-1111-4111-8111-111111111111',-910010,'applied',false),
 ('a1111111-1111-4111-8111-111111111111',-910011,'applied',true),
 ('b2222222-2222-4222-8222-222222222222',-910010,'interviewing',true),
 ('b2222222-2222-4222-8222-222222222222',-910011,'interviewing',false);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.merge_duplicate_catalog_jobs(-910010,ARRAY[-910011]::bigint[],'saved-keeper-fixture');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.user_job_statuses WHERE job_id=-910010 AND is_saved)<>2 THEN RAISE EXCEPTION 'Merge lost owner bookmarks'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_job_statuses WHERE user_id='a1111111-1111-4111-8111-111111111111' AND job_id=-910010 AND status='applied') THEN RAISE EXCEPTION 'Merge changed progress'; END IF;
END $$;
