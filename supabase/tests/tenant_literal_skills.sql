-- Two authorized tenants receive their own literal matches through durable scoring.
UPDATE public.jobs SET description='Google maintain build. Pythonic patterns.' WHERE id=-910001;
UPDATE public.jobs SET description='Go, AI, UI, C++, C#, .NET, Node.js, Python and Rust required.' WHERE id=-910002;
UPDATE public.user_profiles SET keywords=ARRAY['Go','AI','UI','C++','C#','.NET','Node.js','Python'],
 tools_software='{}',certifications='',target_roles='{}' WHERE user_id='a1111111-1111-4111-8111-111111111111';
UPDATE public.user_profiles SET keywords=ARRAY['Rust'],tools_software='{}',certifications='',target_roles='{}'
 WHERE user_id='b2222222-2222-4222-8222-222222222222';
INSERT INTO public.job_scoring_embeddings(job_id,content_hash,model_version,embedding)
SELECT id,'literal-test-'||id,'all-MiniLM-L6-v2:384:v1',('[1,'||repeat('0,',382)||'0]')::extensions.vector
FROM public.jobs WHERE id IN (-910001,-910002);
-- Old factors must be replaced even when hashes and vectors are unchanged.
UPDATE public.user_job_evaluations SET scoring_version='native-sql-v1',scoring_job_hash='literal-test--910001',
 scoring_profile_hash=repeat('a',64) WHERE job_id=-910001;
CREATE FUNCTION pg_temp.drain_literal_scoring() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN FOR i IN 1..50 LOOP PERFORM public.process_candidate_scoring(100); END LOOP; END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
SELECT public.save_profile_embedding(('[1,'||repeat('0,',382)||'0]')::extensions.vector,repeat('a',64),'all-MiniLM-L6-v2:384:v1');
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.jobpulse_has_literal_skill(text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.score_job_for_user(uuid,bigint,real)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser can invoke scoring internals';
 END IF;
 BEGIN PERFORM public.jobpulse_has_literal_skill('Go','Go'); RAISE EXCEPTION 'Internal matcher exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.score_job_for_user('b2222222-2222-4222-8222-222222222222',-910002,1); RAISE EXCEPTION 'Foreign score write exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
SELECT public.save_profile_embedding(('[1,'||repeat('0,',382)||'0]')::extensions.vector,repeat('b',64),'all-MiniLM-L6-v2:384:v1');
-- Run the backend worker with its real service context, outside browser claims.
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.drain_literal_scoring();
DO $$ DECLARE q record; BEGIN
 SELECT state,needs_embedding,last_error_code,cursor,cardinality(shortlist_ids) AS shortlist_count, -910001=ANY(shortlist_ids) AS shortlisted, -910001=ANY(job_ids) AS selected INTO q FROM public.candidate_scoring_work
 WHERE user_id='a1111111-1111-4111-8111-111111111111';
 IF q.state<>'complete' OR NOT coalesce(q.selected,false) THEN RAISE EXCEPTION 'Literal scoring did not complete: %',row_to_json(q); END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
DO $$ BEGIN
 IF (SELECT matched_skills FROM public.user_job_evaluations WHERE job_id=-910002) <> '["Rust"]'::jsonb THEN RAISE EXCEPTION 'Tenant B received foreign skills'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_job_evaluations WHERE user_id='a1111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'Foreign scores readable'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$ DECLARE skills jsonb; BEGIN
 IF (SELECT matched_skills FROM public.user_job_evaluations WHERE job_id=-910001)<>'[]'::jsonb THEN RAISE EXCEPTION 'Substring false positives survived scoring: %', (SELECT jsonb_build_object('skills',matched_skills,'version',scoring_version,'job_hash',scoring_job_hash) FROM public.user_job_evaluations WHERE job_id=-910001); END IF;
 SELECT matched_skills INTO skills FROM public.user_job_evaluations WHERE job_id=-910002;
 IF jsonb_array_length(skills)<>8 OR NOT skills @> '["Go","AI","UI","C++","C#",".NET","Node.js","Python"]'::jsonb THEN RAISE EXCEPTION 'Published literal skills lost: %',skills; END IF;
 IF EXISTS(SELECT 1 FROM public.user_job_evaluations WHERE scoring_version<>'native-sql-v2') THEN RAISE EXCEPTION 'Old scoring revision was reused'; END IF;
 IF (SELECT status FROM public.user_job_statuses WHERE job_id=-910001)<>'applied' THEN RAISE EXCEPTION 'Rescoring changed candidate tracking'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.jobpulse_has_literal_skill('Go','Go'); RAISE EXCEPTION 'Anonymous matcher access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- An algorithm revision must invalidate identical vector hashes without a profile edit.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_job_evaluations SET scoring_version='native-sql-v1',matched_skills='["stale-substring"]'
WHERE user_id='a1111111-1111-4111-8111-111111111111' AND job_id=-910001;
UPDATE public.scoring_catalog_generation SET generation=generation+1 WHERE id;
SELECT pg_temp.drain_literal_scoring();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_job_evaluations WHERE job_id=-910001
  AND scoring_version='native-sql-v2' AND matched_skills='[]'::jsonb) THEN
  RAISE EXCEPTION 'Revision change reused stale factors with identical vector hashes';
 END IF;
END $$;
RESET ROLE;
