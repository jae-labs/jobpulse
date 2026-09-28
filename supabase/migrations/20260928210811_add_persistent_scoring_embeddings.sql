CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Embeddings stay separate from the catalog: ordinary jobs SELECT * requests
-- must not download hundreds of floats per card or expose candidate vectors.
CREATE TABLE public.job_scoring_embeddings (
    job_id bigint PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
    content_hash text NOT NULL,
    model_version text NOT NULL,
    embedding extensions.vector(384) NOT NULL
);

CREATE TABLE public.profile_scoring_embeddings (
    user_id uuid PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    content_hash text NOT NULL,
    model_version text NOT NULL,
    embedding extensions.vector(384) NOT NULL
);

ALTER TABLE public.job_scoring_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_scoring_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_scoring_embeddings, public.profile_scoring_embeddings FROM anon, authenticated;
GRANT ALL ON public.job_scoring_embeddings, public.profile_scoring_embeddings TO service_role;

ALTER TABLE public.user_job_evaluations
    ADD COLUMN scoring_job_hash text,
    ADD COLUMN scoring_profile_hash text,
    ADD COLUMN scoring_version text;

-- Exact comparisons on a bounded page. Returning JSON avoids PostgREST's
-- max_rows silently truncating multi-user work. There is no ANN shortlist:
-- salary/domain-heavy custom weights can still rank any job in the catalog.
CREATE FUNCTION public.get_job_scoring_work(
    p_jobs jsonb,
    p_profiles jsonb,
    p_model_version text,
    p_scoring_version text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF jsonb_array_length(p_jobs) > 100 OR jsonb_array_length(p_profiles) > 100 THEN
        RAISE EXCEPTION 'Scoring work is limited to 100 jobs and 100 profiles per call';
    END IF;
    RETURN (
        WITH job_inputs AS (
            SELECT * FROM jsonb_to_recordset(p_jobs)
                AS j(job_id bigint, content_hash text, embedding_hash text)
        ), profile_inputs AS (
            SELECT * FROM jsonb_to_recordset(p_profiles)
                AS p(user_id uuid, content_hash text, embedding_hash text)
        ), pairs AS (
            SELECT j.job_id, p.user_id, j.content_hash AS job_hash, p.content_hash AS profile_hash,
                CASE WHEN je.embedding IS NOT NULL AND pe.embedding IS NOT NULL
                    THEN greatest(0.0, least(1.0, 1.0 - (je.embedding OPERATOR(extensions.<=>) pe.embedding)))
                    ELSE NULL END AS semantic_similarity,
                p_scoring_version || CASE WHEN je.embedding IS NULL OR pe.embedding IS NULL
                    THEN ':fallback' ELSE '' END AS version
            FROM job_inputs j CROSS JOIN profile_inputs p
            LEFT JOIN public.job_scoring_embeddings je ON je.job_id = j.job_id
                AND je.content_hash = j.embedding_hash AND je.model_version = p_model_version
            LEFT JOIN public.profile_scoring_embeddings pe ON pe.user_id = p.user_id
                AND pe.content_hash = p.embedding_hash AND pe.model_version = p_model_version
        )
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'job_id', pairs.job_id, 'user_id', pairs.user_id,
            'semantic_similarity', pairs.semantic_similarity, 'scoring_version', pairs.version
        )), '[]'::jsonb)
        FROM pairs
        LEFT JOIN public.user_job_evaluations e ON e.job_id = pairs.job_id AND e.user_id = pairs.user_id
        WHERE e.scoring_job_hash IS DISTINCT FROM pairs.job_hash
            OR e.scoring_profile_hash IS DISTINCT FROM pairs.profile_hash
            OR e.scoring_version IS DISTINCT FROM pairs.version
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_scoring_work(jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_scoring_work(jsonb, jsonb, text, text) TO service_role;
