-- Tenant fixtures and transaction are provided by the local runner.
CREATE FUNCTION pg_temp.drain_queue() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN FOR i IN 1..50 LOOP PERFORM public.process_candidate_scoring(100); END LOOP; END $$;
-- Missing vectors remain observable after workers run; no setup state can be silently lost.
DO $$ BEGIN
 PERFORM public.process_candidate_scoring(100);
 IF NOT EXISTS(SELECT 1 FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111' AND state='awaiting_embedding') THEN
  RAISE EXCEPTION 'Worker discarded a profile awaiting local inference';
 END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$ DECLARE bad jsonb; result jsonb; BEGIN
 IF public.get_profile_embedding_state()->>'scoring_state'<>'awaiting_embedding' THEN RAISE EXCEPTION 'Setup state is not visible to owner'; END IF;
 FOREACH bad IN ARRAY ARRAY['{"weights":{"semantic":"not numeric"}}'::jsonb,'{"weights":{"semantic":101}}','{"positive_domains":{}}','{"seniority_tiers":[{"name":"bad","keywords":[],"score_weight":"invalid"}]}','{"disqualifiers":[{}]}'] LOOP
  BEGIN
   UPDATE public.user_profiles SET scoring_rules=bad WHERE user_id=auth.uid();
   RAISE EXCEPTION 'Malformed scoring inputs accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM public.save_profile_embedding(('[0,'||repeat('0,',382)||'0]')::extensions.vector,repeat('a',64),'all-MiniLM-L6-v2:384:v1');
  RAISE EXCEPTION 'Zero vector accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Zero vector accepted' THEN RAISE; END IF;
 END;
 PERFORM public.save_profile_embedding(('[1,'||repeat('0,',382)||'0]')::extensions.vector,repeat('a',64),'all-MiniLM-L6-v2:384:v1');
 result:=public.get_profile_embedding_state();
 IF result->>'scoring_state'<>'pending' THEN RAISE EXCEPTION 'Embedding and queue were not atomic'; END IF;
 IF has_function_privilege('authenticated','public.process_candidate_scoring_queue(integer)','EXECUTE') THEN RAISE EXCEPTION 'Browser queue execution exposed'; END IF;
 IF has_function_privilege('authenticated','public.process_candidate_scoring(integer)','EXECUTE') THEN RAISE EXCEPTION 'Browser worker execution exposed'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE vec extensions.vector:=('[1,'||repeat('0,',382)||'0]')::extensions.vector; generation_before bigint; BEGIN
 SELECT generation INTO generation_before FROM public.scoring_catalog_generation;
 INSERT INTO public.jobs(id,dedupe_key,title,company,location,description,url,source,last_seen_at)
 SELECT -940000-i,'synthetic-queue-'||i,'Synthetic queue job '||i,'Synthetic employer','Test City','Synthetic vacancy description','https://example.invalid/queue/'||i,'test',now() FROM generate_series(1,1601) i;
 INSERT INTO public.job_scoring_embeddings(job_id,embedding,content_hash,model_version)
 SELECT -940000-i,vec,'synthetic-'||i,'all-MiniLM-L6-v2:384:v1' FROM generate_series(1,1601) i;
 IF (SELECT generation FROM public.scoring_catalog_generation)<>generation_before+1 THEN RAISE EXCEPTION 'Catalog trigger fanned out per row'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_job_evaluations WHERE user_id='a1111111-1111-4111-8111-111111111111' AND job_id<-940000) THEN RAISE EXCEPTION 'Ingestion still scored tenants synchronously'; END IF;
 PERFORM public.process_candidate_scoring(100);
 IF (SELECT cursor FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111')>100 THEN RAISE EXCEPTION 'Worker exceeded batch'; END IF;
 PERFORM pg_temp.drain_queue();
 IF (SELECT count(*) FROM public.user_job_evaluations WHERE user_id='a1111111-1111-4111-8111-111111111111' AND scoring_version='native-sql-v1')<>1500 THEN RAISE EXCEPTION 'Exact shortlist did not cover 1500 jobs'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_job_evaluations WHERE user_id='b2222222-2222-4222-8222-222222222222' AND job_id<-940000) THEN RAISE EXCEPTION 'Queue crossed ownership'; END IF;
 -- If inference fails after a text edit, persistent setup state survives refresh and old results remain usable.
 UPDATE public.user_profiles SET summary='Synthetic changed matching document' WHERE user_id='a1111111-1111-4111-8111-111111111111';
 IF (SELECT state FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111')<>'awaiting_embedding' THEN RAISE EXCEPTION 'Text edit lost desired embedding state'; END IF;
 PERFORM public.process_candidate_scoring_queue(50);
 IF (SELECT state FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111')<>'awaiting_embedding' THEN RAISE EXCEPTION 'Worker completed against an outdated profile vector'; END IF;
 IF (SELECT count(*) FROM public.user_job_evaluations WHERE user_id='a1111111-1111-4111-8111-111111111111' AND scoring_version='native-sql-v1')<>1500 THEN RAISE EXCEPTION 'Awaiting inference discarded usable results'; END IF;
 PERFORM public.save_profile_embedding(vec,repeat('b',64),'all-MiniLM-L6-v2:384:v1');
 PERFORM pg_temp.drain_queue();
 -- Weight-only changes reuse cached factors and completed work.
 UPDATE public.user_profiles SET scoring_rules=jsonb_set(scoring_rules,'{weights,semantic}','30') WHERE user_id='a1111111-1111-4111-8111-111111111111';
 IF (SELECT state FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111')<>'complete' THEN RAISE EXCEPTION 'Weight edit enqueued full scoring'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$ BEGIN
 IF (public.get_profile_embedding_state()->>'completed_jobs')::integer<>1500 THEN RAISE EXCEPTION 'Completion state missing'; END IF;
 BEGIN PERFORM public.rescore_user('b2222222-2222-4222-8222-222222222222'); RAISE EXCEPTION 'Foreign enqueue accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Foreign enqueue accepted' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
-- Prove one legacy poisoned profile cannot abort another user's batch.
ALTER TABLE public.user_profiles DISABLE TRIGGER validate_profile_scoring_inputs;
UPDATE public.user_profiles SET scoring_rules='{"weights":{"semantic":"bad"}}' WHERE user_id='a1111111-1111-4111-8111-111111111111';
ALTER TABLE public.user_profiles ENABLE TRIGGER validate_profile_scoring_inputs;
UPDATE public.candidate_scoring_work SET state='pending',job_ids=NULL,completed_fingerprint='force-legacy-retry',updated_at=now()-interval '1 day' WHERE user_id='a1111111-1111-4111-8111-111111111111';
INSERT INTO public.profile_scoring_embeddings(user_id,embedding,content_hash,model_version)
VALUES('b2222222-2222-4222-8222-222222222222',('[1,'||repeat('0,',382)||'0]')::extensions.vector,repeat('b',64),'all-MiniLM-L6-v2:384:v1');
DO $$ BEGIN
 PERFORM public.process_candidate_scoring(100);
 IF (SELECT state FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111')<>'failed' THEN RAISE EXCEPTION 'Failed work did not persist retry state'; END IF;
 PERFORM public.process_candidate_scoring(100);
 IF NOT EXISTS(SELECT 1 FROM public.user_job_evaluations WHERE user_id='b2222222-2222-4222-8222-222222222222' AND job_id<-940000) THEN RAISE EXCEPTION 'Poisoned profile blocked healthy tenant'; END IF;
 UPDATE public.user_profiles SET scoring_rules='{}' WHERE user_id='a1111111-1111-4111-8111-111111111111';
 IF (SELECT state FROM public.candidate_scoring_work WHERE user_id='a1111111-1111-4111-8111-111111111111')<>'pending' THEN RAISE EXCEPTION 'Repair failed to enqueue retry'; END IF;
END $$;
