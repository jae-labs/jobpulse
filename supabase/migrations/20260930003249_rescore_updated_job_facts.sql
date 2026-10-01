-- A scoring fact can change without changing the embedding document. Refresh
-- previously evaluated jobs even when their cosine similarity is below 0.30.
CREATE OR REPLACE FUNCTION public.score_new_job_embedding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  profile record;
  similarity real;
BEGIN
  FOR profile IN SELECT pe.user_id,pe.embedding,pe.model_version
    FROM public.profile_scoring_embeddings pe
    JOIN public.authorized_users a ON a.user_id=pe.user_id AND a.status='accepted'
  LOOP
    IF NEW.model_version <> profile.model_version THEN CONTINUE; END IF;
    similarity := (1 - (NEW.embedding OPERATOR(extensions.<=>) profile.embedding))::real;
    IF similarity > 0.30 OR EXISTS (
      SELECT 1 FROM public.user_job_evaluations e
      WHERE e.user_id=profile.user_id AND e.job_id=NEW.job_id
    ) THEN
      PERFORM public.score_job_for_user(profile.user_id,NEW.job_id,similarity);
      DELETE FROM public.user_job_evaluations e WHERE e.id IN (
        SELECT ranked.id FROM (
          SELECT ue.id, row_number() OVER (ORDER BY je.embedding OPERATOR(extensions.<=>) profile.embedding) AS rank
          FROM public.user_job_evaluations ue
          JOIN public.job_scoring_embeddings je ON je.job_id=ue.job_id
          WHERE ue.user_id=profile.user_id AND ue.scoring_version='native-sql-v1'
        ) ranked WHERE ranked.rank > 1500);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
