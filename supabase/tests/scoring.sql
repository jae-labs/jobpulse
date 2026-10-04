-- Native vector scoring, live weight composition, reverse scoring, and access.
\set ON_ERROR_STOP on
BEGIN;

-- Test-only definer drives the backend worker after an authenticated enqueue.
CREATE FUNCTION pg_temp.drain_scoring() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN FOR i IN 1..30 LOOP PERFORM public.process_candidate_scoring(100); END LOOP; END $$;

DO $$
DECLARE
  v_user_id uuid := '11111111-1111-1111-1111-111111111111';
  v_vector extensions.vector := ('[1,' || repeat('0,', 382) || '0]')::extensions.vector;
BEGIN
  IF to_regprocedure('public.get_job_scoring_work(jsonb,jsonb,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Removed scraper scoring RPC is still present';
  END IF;
  IF has_table_privilege('authenticated', 'public.profile_scoring_embeddings', 'SELECT')
    OR has_table_privilege('anon', 'public.job_scoring_embeddings', 'SELECT')
    OR has_function_privilege('anon', 'public.rescore_user(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Scoring internals are exposed to browser roles';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rescore_user(uuid,integer)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.save_profile_embedding(extensions.vector,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated profile scoring RPCs are unavailable';
  END IF;

  INSERT INTO public.job_scoring_embeddings(job_id,content_hash,model_version,embedding)
  VALUES (101,'sql-test-job','all-MiniLM-L6-v2:384:v1',v_vector)
  ON CONFLICT (job_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,
    model_version=EXCLUDED.model_version, embedding=EXCLUDED.embedding;
  INSERT INTO public.profile_scoring_embeddings(user_id,content_hash,model_version,embedding)
  VALUES (v_user_id,'sql-test-profile','all-MiniLM-L6-v2:384:v1',v_vector)
  ON CONFLICT (user_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,
    model_version=EXCLUDED.model_version, embedding=EXCLUDED.embedding;

  UPDATE public.user_profiles SET scoring_rules = jsonb_set(
    coalesce(scoring_rules,'{}'::jsonb), '{weights}',
    '{"sector":0,"semantic":10,"competency":0,"seniority":0,"salary":0,"contract":0,"target_role_bonus":0,"location_bonus":0,"work_mode_bonus":0,"fixed_term_penalty":0,"disqualification_cap":10}'::jsonb,
    true) WHERE user_id=v_user_id;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);

DO $$
DECLARE
  v_user_id uuid := '11111111-1111-1111-1111-111111111111';
  v_item jsonb;
  v_stored integer;
BEGIN
  PERFORM public.rescore_user(v_user_id,1);
  PERFORM pg_temp.drain_scoring();
  SELECT relevance INTO v_stored FROM public.user_job_evaluations
    WHERE user_id=v_user_id AND job_id=101;
  IF v_stored <> 10 OR NOT EXISTS (
    SELECT 1 FROM public.user_job_evaluations WHERE user_id=v_user_id AND job_id=101
      AND scoring_version='native-sql-v2'
      AND (ai_analysis->>'semantic_similarity')::numeric=1) THEN
    RAISE EXCEPTION 'Expected cosine similarity 1 and a 10-point SQL score, got %', v_stored;
  END IF;

  UPDATE public.user_profiles SET scoring_rules=jsonb_set(scoring_rules,'{weights,semantic}','20'::jsonb)
    WHERE user_id=v_user_id;
  SELECT value INTO v_item FROM jsonb_array_elements(public.get_jobs_page(p_limit=>100)->'items')
    WHERE value->>'id'='101';
  IF (v_item->>'relevance')::integer <> 20 OR
    (SELECT relevance FROM public.user_job_evaluations WHERE user_id=v_user_id AND job_id=101) <> v_stored THEN
    RAISE EXCEPTION 'Weight change did not recompose the catalog without rewriting evaluation: %', v_item;
  END IF;

  UPDATE public.user_profiles SET scoring_rules=jsonb_set(scoring_rules,'{disqualifiers}','["Staff"]'::jsonb)
    WHERE user_id=v_user_id;
  PERFORM public.rescore_user(v_user_id,1);
  PERFORM pg_temp.drain_scoring();
  IF (SELECT relevance FROM public.user_job_evaluations WHERE user_id=v_user_id AND job_id=101) > 15 THEN
    RAISE EXCEPTION 'Dealbreaker score exceeded the 15-point ceiling';
  END IF;
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_vector extensions.vector := ('[0,1,' || repeat('0,', 381) || '0]')::extensions.vector;
BEGIN
  UPDATE public.user_profiles SET scoring_rules=jsonb_set(scoring_rules,'{disqualifiers}','[]'::jsonb)
    WHERE user_id='11111111-1111-1111-1111-111111111111';
  INSERT INTO public.job_scoring_embeddings(job_id,content_hash,model_version,embedding)
  VALUES (103,'sql-test-new-job','all-MiniLM-L6-v2:384:v1',v_vector)
  ON CONFLICT (job_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,
    model_version=EXCLUDED.model_version, embedding=EXCLUDED.embedding;
  PERFORM public.rescore_user('11111111-1111-1111-1111-111111111111',1500);
  PERFORM pg_temp.drain_scoring();
  IF NOT EXISTS (SELECT 1 FROM public.user_job_evaluations
    WHERE user_id='11111111-1111-1111-1111-111111111111' AND job_id=103
      AND scoring_version='native-sql-v2') THEN
    RAISE EXCEPTION 'Updated low-similarity job did not refresh its existing evaluation';
  END IF;
END;
$$;
ROLLBACK;
