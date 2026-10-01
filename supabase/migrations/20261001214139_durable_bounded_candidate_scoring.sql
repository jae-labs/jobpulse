-- Ingestion advances one catalog generation per statement, independent of tenant count.
CREATE TABLE public.scoring_catalog_generation(id boolean PRIMARY KEY DEFAULT true CHECK(id), generation bigint NOT NULL DEFAULT 1);
INSERT INTO public.scoring_catalog_generation DEFAULT VALUES;
CREATE TABLE public.candidate_scoring_work(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 desired_revision bigint NOT NULL DEFAULT 1, completed_revision bigint NOT NULL DEFAULT 0,
 fingerprint text NOT NULL, completed_fingerprint text NOT NULL DEFAULT '', needs_embedding boolean NOT NULL DEFAULT false, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('awaiting_embedding','pending','running','complete','failed')),
 catalog_generation bigint NOT NULL DEFAULT 0, completed_catalog_generation bigint NOT NULL DEFAULT 0,
 job_ids bigint[], shortlist_ids bigint[], cursor integer NOT NULL DEFAULT 0, top_k integer NOT NULL DEFAULT 1500 CHECK(top_k BETWEEN 1 AND 1500),
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT now(),
 last_error_code text, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scoring_catalog_generation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_scoring_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scoring_catalog_generation,public.candidate_scoring_work FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.scoring_catalog_generation,public.candidate_scoring_work TO service_role;
CREATE INDEX candidate_scoring_work_schedule_idx ON public.candidate_scoring_work(retry_at,updated_at);

CREATE FUNCTION public.enqueue_candidate_scoring(p_user_id uuid,p_top_k integer DEFAULT 1500) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f text;
BEGIN
 SELECT md5(concat_ws(':',pe.content_hash,pe.model_version,
   (jsonb_build_object('headline',p.headline,'current_role',p.current_role,'summary',p.summary,
    'keywords',p.keywords,'tools',p.tools_software,'certifications',p.certifications,'education',p.education,
    'roles',p.target_roles,'locations',p.target_locations,'mode',p.work_mode,'salary',p.salary_min,
    'employment',p.employment,'authorization',p.work_authorization,'rules',coalesce(p.scoring_rules,'{}'::jsonb)-'weights'))::text)) INTO f
 FROM public.user_profiles p JOIN public.profile_scoring_embeddings pe ON pe.user_id=p.user_id WHERE p.user_id=p_user_id;
 IF f IS NULL OR EXISTS(SELECT 1 FROM public.candidate_scoring_work WHERE user_id=p_user_id AND needs_embedding) THEN
  INSERT INTO public.candidate_scoring_work(user_id,fingerprint,state,needs_embedding) VALUES(p_user_id,'','awaiting_embedding',true)
  ON CONFLICT(user_id) DO UPDATE SET state='awaiting_embedding',needs_embedding=true,fingerprint='',updated_at=clock_timestamp();
  RETURN;
 END IF;
 INSERT INTO public.candidate_scoring_work(user_id,fingerprint,top_k) VALUES(p_user_id,f,least(greatest(coalesce(p_top_k,1500),1),1500))
 ON CONFLICT(user_id) DO UPDATE SET
  fingerprint=EXCLUDED.fingerprint, desired_revision=public.candidate_scoring_work.desired_revision+1,
  state='pending',job_ids=NULL,cursor=0,attempts=0,retry_at=now(),last_error_code=NULL,top_k=EXCLUDED.top_k
 WHERE public.candidate_scoring_work.fingerprint IS DISTINCT FROM EXCLUDED.fingerprint
  OR public.candidate_scoring_work.top_k<>EXCLUDED.top_k OR public.candidate_scoring_work.state='failed';
END $$;
REVOKE ALL ON FUNCTION public.enqueue_candidate_scoring(uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.enqueue_profile_scoring() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='user_profiles' AND TG_OP='UPDATE' THEN
  IF ROW(NEW.headline,NEW.current_role,NEW.summary,NEW.keywords,NEW.tools_software,NEW.languages,NEW.certifications,NEW.education)
    IS DISTINCT FROM ROW(OLD.headline,OLD.current_role,OLD.summary,OLD.keywords,OLD.tools_software,OLD.languages,OLD.certifications,OLD.education) THEN
   UPDATE public.candidate_scoring_work SET needs_embedding=true,state='awaiting_embedding',fingerprint='',updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
  END IF;
 ELSIF TG_TABLE_NAME='profile_scoring_embeddings' THEN
  UPDATE public.candidate_scoring_work SET needs_embedding=false WHERE user_id=NEW.user_id;
 END IF;
 PERFORM public.enqueue_candidate_scoring(NEW.user_id,coalesce((SELECT top_k FROM public.candidate_scoring_work WHERE user_id=NEW.user_id),1500));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_profile_scoring() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enqueue_profile_scoring AFTER INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.enqueue_profile_scoring();
CREATE TRIGGER enqueue_profile_embedding_scoring AFTER INSERT OR UPDATE ON public.profile_scoring_embeddings
FOR EACH ROW EXECUTE FUNCTION public.enqueue_profile_scoring();

DROP TRIGGER score_new_job_embedding ON public.job_scoring_embeddings;
CREATE OR REPLACE FUNCTION public.score_new_job_embedding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE public.scoring_catalog_generation SET generation=generation+1 WHERE id; RETURN NULL; END $$;
CREATE TRIGGER score_new_job_embedding AFTER INSERT OR UPDATE OR DELETE ON public.job_scoring_embeddings
FOR EACH STATEMENT EXECUTE FUNCTION public.score_new_job_embedding();

-- Compatibility API: requests durable work, never performs unbounded scoring in a browser request.
CREATE OR REPLACE FUNCTION public.rescore_user(p_user_id uuid,p_top_k integer DEFAULT 1500) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND
  (auth.uid() IS DISTINCT FROM p_user_id OR NOT public.is_authorized_user()) THEN RAISE EXCEPTION 'Access denied'; END IF;
 PERFORM public.enqueue_candidate_scoring(p_user_id,p_top_k);
 RETURN 0;
END $$;

-- One bounded slice of the oldest eligible tenant; SKIP LOCKED permits service workers to share work.
CREATE FUNCTION public.process_candidate_scoring(p_batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w public.candidate_scoring_work%ROWTYPE; pe public.profile_scoring_embeddings%ROWTYPE;
 generation bigint; candidate record; processed integer:=0; ids bigint[]; end_cursor integer; err text;
BEGIN
 SELECT g.generation INTO generation FROM public.scoring_catalog_generation g WHERE id;
 SELECT q.* INTO w FROM public.candidate_scoring_work q
 JOIN public.authorized_users a ON a.user_id=q.user_id AND a.status='accepted'
 WHERE q.state<>'awaiting_embedding' AND q.retry_at<=now() AND (q.state IN ('pending','running','failed') OR q.completed_catalog_generation<generation)
 ORDER BY q.updated_at,q.user_id FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF w.user_id IS NULL THEN RETURN 0; END IF;
 BEGIN
  SELECT * INTO pe FROM public.profile_scoring_embeddings WHERE user_id=w.user_id;
  IF pe.user_id IS NULL THEN DELETE FROM public.candidate_scoring_work WHERE user_id=w.user_id; RETURN 0; END IF;
  IF w.job_ids IS NULL OR w.state='complete' THEN
   -- A materialized distance list forces exact ranking. HNSW ef_search cannot guarantee K=1500.
   WITH distances AS MATERIALIZED (
    SELECT job_id,embedding OPERATOR(extensions.<=>) pe.embedding AS distance
    FROM public.job_scoring_embeddings WHERE model_version=pe.model_version
   ), shortlist AS (SELECT job_id,distance FROM distances ORDER BY distance,job_id LIMIT w.top_k)
   SELECT coalesce(array_agg(job_id ORDER BY distance,job_id),'{}'::bigint[]) INTO ids FROM shortlist;
   w.shortlist_ids:=ids;
   -- Catalog refreshes score only changed/new facts. Profile rule changes recompute the shortlist.
   SELECT coalesce(array_agg(j.job_id ORDER BY j.job_id),'{}'::bigint[]) INTO w.job_ids
   FROM public.job_scoring_embeddings j LEFT JOIN public.user_job_evaluations e ON e.job_id=j.job_id AND e.user_id=w.user_id
   WHERE j.job_id=ANY(ids) AND (w.completed_fingerprint IS DISTINCT FROM w.fingerprint
    OR e.job_id IS NULL OR e.scoring_version IS DISTINCT FROM 'native-sql-v1'
    OR e.scoring_job_hash IS DISTINCT FROM j.content_hash OR e.scoring_profile_hash IS DISTINCT FROM pe.content_hash);
   w.cursor:=0; w.catalog_generation:=generation;
  END IF;
  end_cursor:=least(cardinality(w.job_ids),w.cursor+least(greatest(coalesce(p_batch_size,100),1),100));
  FOR candidate IN SELECT j.job_id,(1-(j.embedding OPERATOR(extensions.<=>) pe.embedding))::real AS similarity
   FROM unnest(w.job_ids[w.cursor+1:end_cursor]) selected(job_id)
   JOIN public.job_scoring_embeddings j ON j.job_id=selected.job_id AND j.model_version=pe.model_version
  LOOP PERFORM public.score_job_for_user(w.user_id,candidate.job_id,candidate.similarity); processed:=processed+1; END LOOP;
  IF end_cursor=cardinality(w.job_ids) THEN
   DELETE FROM public.user_job_evaluations e WHERE e.user_id=w.user_id AND e.scoring_version='native-sql-v1'
    AND NOT(e.job_id=ANY(w.shortlist_ids));
  END IF;
  UPDATE public.candidate_scoring_work SET job_ids=w.job_ids,shortlist_ids=w.shortlist_ids,cursor=end_cursor,catalog_generation=w.catalog_generation,
   state=CASE WHEN end_cursor=cardinality(w.job_ids) THEN 'complete' ELSE 'running' END,
   completed_fingerprint=CASE WHEN end_cursor=cardinality(w.job_ids) THEN w.fingerprint ELSE completed_fingerprint END,
   completed_revision=CASE WHEN end_cursor=cardinality(w.job_ids) THEN desired_revision ELSE completed_revision END,
   completed_catalog_generation=CASE WHEN end_cursor=cardinality(w.job_ids) THEN w.catalog_generation ELSE completed_catalog_generation END,
   attempts=0,last_error_code=NULL,updated_at=clock_timestamp(),retry_at=now() WHERE user_id=w.user_id;
 EXCEPTION WHEN OTHERS OR query_canceled THEN
  GET STACKED DIAGNOSTICS err=RETURNED_SQLSTATE;
  UPDATE public.candidate_scoring_work SET state='failed',attempts=attempts+1,last_error_code=err,
   updated_at=clock_timestamp(),retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)) WHERE user_id=w.user_id;
  RETURN 0;
 END;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public.process_candidate_scoring(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_candidate_scoring(integer) TO service_role;

-- Drain multiple tenants per tick without an unbounded transaction or ingestion fan-out.
CREATE FUNCTION public.process_candidate_scoring_queue(p_max_slices integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE started timestamptz:=clock_timestamp(); processed integer:=0;
BEGIN
 FOR i IN 1..least(greatest(coalesce(p_max_slices,50),1),50) LOOP
  EXIT WHEN clock_timestamp()-started>=interval '5 seconds';
  EXIT WHEN NOT EXISTS (
   SELECT 1 FROM public.candidate_scoring_work q
   JOIN public.authorized_users a ON a.user_id=q.user_id AND a.status='accepted'
   CROSS JOIN public.scoring_catalog_generation g
   WHERE g.id AND q.state<>'awaiting_embedding' AND q.retry_at<=now()
    AND (q.state IN ('pending','running','failed') OR q.completed_catalog_generation<g.generation)
  );
  processed:=processed+public.process_candidate_scoring(100);
 END LOOP;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public.process_candidate_scoring_queue(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_candidate_scoring_queue(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_profile_embedding_state() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.is_authorized_user() THEN (
  SELECT jsonb_build_object('content_hash',pe.content_hash,'model_version',pe.model_version,
   'scoring_state',CASE WHEN q.completed_catalog_generation<g.generation AND q.state='complete' THEN 'pending' ELSE coalesce(q.state,'pending') END,
   'desired_revision',coalesce(q.desired_revision,0),'completed_revision',coalesce(q.completed_revision,0),
   'completed_jobs',coalesce(q.cursor,0),'total_jobs',coalesce(cardinality(q.job_ids),0),
   'updated_at',q.updated_at,'error_code',q.last_error_code)
  FROM public.user_profiles p LEFT JOIN public.profile_scoring_embeddings pe ON pe.user_id=p.user_id
  LEFT JOIN public.candidate_scoring_work q ON q.user_id=p.user_id
  CROSS JOIN public.scoring_catalog_generation g WHERE p.user_id=auth.uid() AND g.id
 ) ELSE NULL END
$$;

-- No age-only destructive maintenance: closure needs trustworthy, source-specific evidence.
CREATE OR REPLACE FUNCTION public.prune_stale_catalog_jobs(p_retention_days integer DEFAULT 3) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT 0 $$;

-- Backfill durable requests, without scoring inside this migration.
SELECT public.enqueue_candidate_scoring(p.user_id) FROM public.user_profiles p
JOIN public.authorized_users a ON a.user_id=p.user_id AND a.status='accepted';

-- Persisted work survives tab closure. Cron is a small worker, not ingestion latency.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('jobpulse-candidate-scoring','1 second',
 $$SET statement_timeout='8s'; SELECT public.process_candidate_scoring_queue(50);$$);
-- Operational history is bounded; results contain counts, never candidate content.
SELECT cron.schedule('jobpulse-cron-history-retention','17 3 * * *',
 $$DELETE FROM cron.job_run_details WHERE end_time<now()-interval '365 days';$$);
