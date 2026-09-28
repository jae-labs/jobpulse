-- Exact pgvector scores, cache invalidation, and service-only access.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
    v_job_id bigint := (SELECT min(id) FROM public.jobs);
    v_user_id uuid := '11111111-1111-1111-1111-111111111111';
    vector_value extensions.vector := ('[1,' || repeat('0,', 382) || '0]')::extensions.vector;
    jobs jsonb;
    profiles jsonb;
    work jsonb;
BEGIN
    jobs := jsonb_build_array(jsonb_build_object('job_id', v_job_id, 'content_hash', 'job-v1', 'embedding_hash', 'job-emb'));
    profiles := jsonb_build_array(jsonb_build_object('user_id', v_user_id, 'content_hash', 'profile-v1', 'embedding_hash', 'profile-emb'));
    INSERT INTO public.job_scoring_embeddings VALUES (v_job_id, 'job-emb', 'model-v1', vector_value);
    INSERT INTO public.profile_scoring_embeddings VALUES (v_user_id, 'profile-emb', 'model-v1', vector_value);
    work := public.get_job_scoring_work(jobs, profiles, 'model-v1', 'score-v1');
    IF jsonb_array_length(work) <> 1 OR (work->0->>'semantic_similarity')::float <> 1 THEN
        RAISE EXCEPTION 'Expected exact cosine similarity of 1: %', work;
    END IF;
    INSERT INTO public.user_job_evaluations(user_id, job_id, relevance, scoring_job_hash, scoring_profile_hash, scoring_version)
        VALUES(v_user_id, v_job_id, 80, 'job-v1', 'profile-v1', 'score-v1')
        ON CONFLICT (user_id, job_id) DO UPDATE SET scoring_job_hash='job-v1', scoring_profile_hash='profile-v1', scoring_version='score-v1';
    IF public.get_job_scoring_work(jobs, profiles, 'model-v1', 'score-v1') <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Unchanged evaluations were not skipped';
    END IF;
    IF jsonb_array_length(public.get_job_scoring_work(jsonb_set(jobs, '{0,content_hash}', '"job-v2"'), profiles, 'model-v1', 'score-v1')) <> 1 THEN
        RAISE EXCEPTION 'Job change did not invalidate score';
    END IF;
    IF jsonb_array_length(public.get_job_scoring_work(jobs, jsonb_set(profiles, '{0,content_hash}', '"profile-v2"'), 'model-v1', 'score-v1')) <> 1 THEN
        RAISE EXCEPTION 'Profile change did not invalidate score';
    END IF;
    IF jsonb_array_length(public.get_job_scoring_work(jobs, profiles, 'model-v1', 'score-v2')) <> 1 THEN
        RAISE EXCEPTION 'Algorithm change did not invalidate score';
    END IF;
    work := public.get_job_scoring_work(jobs, profiles, 'model-v2', 'score-v1');
    IF work->0->>'semantic_similarity' IS NOT NULL OR work->0->>'scoring_version' <> 'score-v1:fallback' THEN
        RAISE EXCEPTION 'Mismatched model vectors were used';
    END IF;
    UPDATE public.user_job_evaluations SET scoring_version='score-v1:fallback'
        WHERE user_job_evaluations.job_id = v_job_id AND user_job_evaluations.user_id = v_user_id;
    IF public.get_job_scoring_work(jobs, profiles, 'model-v2', 'score-v1') <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Unchanged fallback scores were not skipped';
    END IF;
    IF jsonb_array_length(public.get_job_scoring_work(jobs, profiles, 'model-v1', 'score-v1')) <> 1 THEN
        RAISE EXCEPTION 'Dense vectors did not replace cached fallback';
    END IF;
    IF has_function_privilege('authenticated', 'public.get_job_scoring_work(jsonb,jsonb,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_job_scoring_work(jsonb,jsonb,text,text)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.profile_scoring_embeddings', 'SELECT')
       OR has_table_privilege('anon', 'public.job_scoring_embeddings', 'SELECT') THEN
        RAISE EXCEPTION 'Scoring internals are exposed to browser roles';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.get_job_scoring_work(jsonb,jsonb,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Service role cannot calculate scores';
    END IF;
END;
$$;
ROLLBACK;
