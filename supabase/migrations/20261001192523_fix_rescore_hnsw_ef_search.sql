-- Increase HNSW dynamic candidate search list to match requested Top-K up to pgvector maximum (1000)

CREATE OR REPLACE FUNCTION "public"."rescore_user"(p_user_id uuid, p_top_k integer DEFAULT 1500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  candidate record;
  updated integer := 0;
  effective_limit integer := least(greatest(coalesce(p_top_k,1500),1),1500);
  target_embedding extensions.vector(384);
BEGIN
  IF auth.role() NOT IN ('service_role') AND
    (auth.uid() IS DISTINCT FROM p_user_id OR NOT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT embedding INTO target_embedding FROM public.profile_scoring_embeddings WHERE user_id=p_user_id;
  IF target_embedding IS NULL THEN RETURN 0; END IF;

  -- Dynamic search candidate list in pgvector HNSW allows up to 1000
  PERFORM set_config('hnsw.ef_search', least(1000, greatest(40, effective_limit))::text, true);

  -- ORDER BY the distance expression directly so the HNSW index can serve Top K.
  FOR candidate IN
    SELECT job_id, (1 - (embedding OPERATOR(extensions.<=>) target_embedding))::real AS similarity
    FROM public.job_scoring_embeddings
    WHERE model_version=(SELECT model_version FROM public.profile_scoring_embeddings WHERE user_id=p_user_id)
    ORDER BY embedding OPERATOR(extensions.<=>) target_embedding LIMIT effective_limit
  LOOP
    PERFORM public.score_job_for_user(p_user_id,candidate.job_id,candidate.similarity);
    updated := updated + 1;
  END LOOP;
  DELETE FROM public.user_job_evaluations e WHERE e.user_id=p_user_id
    AND EXISTS (SELECT 1 FROM public.job_scoring_embeddings available WHERE available.job_id=e.job_id)
    AND NOT EXISTS (
      SELECT 1 FROM (SELECT job_id FROM public.job_scoring_embeddings
        WHERE model_version=(SELECT model_version FROM public.profile_scoring_embeddings WHERE user_id=p_user_id)
        ORDER BY embedding OPERATOR(extensions.<=>) target_embedding LIMIT effective_limit) shortlist
      WHERE shortlist.job_id=e.job_id);
  RETURN updated;
END;
$$;
REVOKE ALL ON FUNCTION "public"."rescore_user"(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."rescore_user"(uuid,integer) TO authenticated, service_role;
