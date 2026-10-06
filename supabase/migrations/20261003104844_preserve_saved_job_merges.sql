-- Keep bookmarks through the service-only candidate-safe catalog merge.
CREATE OR REPLACE FUNCTION public.merge_duplicate_catalog_jobs(
  p_keeper_id bigint, p_duplicate_ids bigint[], p_dedupe_key text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE deleted_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_keeper_id = ANY(p_duplicate_ids) OR cardinality(p_duplicate_ids) > 100
    OR p_dedupe_key IS NULL OR length(p_dedupe_key) > 500 THEN
    RAISE EXCEPTION 'Invalid duplicate merge request';
  END IF;
  -- A conflicting tracked state leaves both jobs intact for manual resolution.
  IF EXISTS (
    SELECT 1 FROM public.user_job_statuses a JOIN public.user_job_statuses b
      ON a.user_id=b.user_id AND a.job_id=p_keeper_id AND b.job_id=ANY(p_duplicate_ids)
    WHERE a.status IS DISTINCT FROM b.status
  ) OR EXISTS (
    SELECT 1 FROM public.user_job_statuses a JOIN public.user_job_statuses b
      ON a.user_id=b.user_id AND a.job_id=ANY(p_duplicate_ids) AND b.job_id=ANY(p_duplicate_ids)
      AND a.job_id <> b.job_id AND a.status IS DISTINCT FROM b.status
  ) THEN RETURN 0; END IF;
  INSERT INTO public.user_job_statuses(user_id,job_id,status,updated_at,is_saved)
  SELECT user_id,p_keeper_id,status,max(updated_at),bool_or(is_saved) FROM public.user_job_statuses
  WHERE job_id=ANY(p_duplicate_ids) GROUP BY user_id,status
  ON CONFLICT (user_id,job_id) DO UPDATE SET is_saved=public.user_job_statuses.is_saved OR excluded.is_saved;
  INSERT INTO public.user_job_evaluations(user_id,job_id,relevance,fit_tier,matched_skills,
    ai_analysis,calculated_at,scoring_job_hash,scoring_profile_hash,scoring_version)
  SELECT user_id,p_keeper_id,relevance,fit_tier,matched_skills,ai_analysis,calculated_at,
    scoring_job_hash,scoring_profile_hash,scoring_version
  FROM public.user_job_evaluations WHERE job_id=ANY(p_duplicate_ids)
  ON CONFLICT (user_id,job_id) DO NOTHING;
  DELETE FROM public.jobs WHERE id=ANY(p_duplicate_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  UPDATE public.jobs SET dedupe_key=p_dedupe_key WHERE id=p_keeper_id;
  RETURN deleted_count;
END;
$$;
