-- Public crawl evidence is bounded; candidate tracking remains independent.
ALTER TABLE public.crawl_tasks ADD CONSTRAINT crawl_lease_pair CHECK
 ((lease_token IS NULL AND lease_until IS NULL) OR (lease_token IS NOT NULL AND lease_until IS NOT NULL));
ALTER TABLE public.crawl_snapshots ADD COLUMN replay_key text CHECK (replay_key ~ '^[a-f0-9]{64}\.json$');
ALTER TABLE public.crawl_snapshots DROP CONSTRAINT crawl_snapshots_run_id_fkey;
ALTER TABLE public.crawl_snapshots ADD CONSTRAINT crawl_snapshots_run_id_fkey
 FOREIGN KEY(run_id) REFERENCES public.crawl_runs(id) ON DELETE SET NULL;

CREATE FUNCTION public.record_crawl_snapshot(p_task_id uuid,p_token uuid,p_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE task public.crawl_tasks; snapshot_id uuid;
BEGIN
 SELECT * INTO task FROM public.crawl_tasks WHERE id=p_task_id AND lease_token=p_token
 AND status='running' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Crawl lease expired'; END IF;
 INSERT INTO public.crawl_snapshots(run_id,source_key,url,http_status,content_hash,body_key,body_bytes,parser_version,replay_key)
 VALUES((SELECT id FROM public.crawl_runs WHERE lease_token=p_token),task.source_key,p_snapshot->>'url',
 (p_snapshot->>'status')::integer,p_snapshot->>'content_hash',p_snapshot->>'body_key',
 (p_snapshot->>'body_bytes')::integer,p_snapshot->>'parser_version',p_snapshot->>'replay_key') RETURNING id INTO snapshot_id;
 RETURN snapshot_id;
END $$;

CREATE OR REPLACE FUNCTION public.persist_crawl_jobs(p_task_id uuid,p_token uuid,p_jobs jsonb)
RETURNS SETOF public.jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE task public.crawl_tasks; item jsonb; vacancy public.jobs; saved public.jobs;
BEGIN
 SELECT * INTO task FROM public.crawl_tasks WHERE id=p_task_id AND lease_token=p_token
 AND status='running' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Crawl lease expired'; END IF;
 IF jsonb_typeof(p_jobs)<>'array' OR jsonb_array_length(p_jobs)>50 OR octet_length(p_jobs::text)>4194304 THEN
  RAISE EXCEPTION 'Invalid crawl batch';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_jobs) LOOP
  vacancy:=jsonb_populate_record(NULL::public.jobs,item->'job');
  INSERT INTO public.jobs(dedupe_key,title,company,location,employment_type,salary_text,description,url,source,
   employer_id,latitude,longitude,coordinate_source,last_seen_at,closed_at)
  VALUES(vacancy.dedupe_key,vacancy.title,vacancy.company,vacancy.location,vacancy.employment_type,
   vacancy.salary_text,vacancy.description,vacancy.url,vacancy.source,vacancy.employer_id,vacancy.latitude,
   vacancy.longitude,vacancy.coordinate_source,now(),NULL)
  ON CONFLICT(dedupe_key) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,
   employment_type=excluded.employment_type,salary_text=excluded.salary_text,
   description=CASE WHEN item->>'work_kind'='detail' AND length(jobs.description)>length(excluded.description)
    THEN jobs.description ELSE excluded.description END,
   url=excluded.url,source=excluded.source,employer_id=coalesce(excluded.employer_id,jobs.employer_id),
   latitude=excluded.latitude,longitude=excluded.longitude,coordinate_source=excluded.coordinate_source,
   last_seen_at=now(),closed_at=NULL RETURNING * INTO saved;
  INSERT INTO public.job_occurrences(job_id,source_key,external_id,source_url,content_hash,snapshot_id)
  VALUES(saved.id,task.source_key,item->>'external_id',saved.url,item->>'content_hash',(item->>'snapshot_id')::uuid)
  ON CONFLICT(source_key,external_id) DO UPDATE SET job_id=excluded.job_id,source_url=excluded.source_url,
   content_hash=excluded.content_hash,last_seen_at=now(),snapshot_id=coalesce(excluded.snapshot_id,job_occurrences.snapshot_id);
  IF item->>'work_kind' IN ('detail','vector') THEN
   PERFORM public.enqueue_crawl((item->>'work_kind') || ':' || saved.id::text,
    jsonb_build_object('kind',item->>'work_kind','job_id',saved.id),20);
  END IF;
  RETURN NEXT saved;
 END LOOP;
END $$;

CREATE FUNCTION public.store_crawl_vectors(p_task_id uuid,p_token uuid,p_vectors jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; vacancy public.jobs; current_facts jsonb; stored integer:=0; vector_value extensions.vector;
BEGIN
 PERFORM 1 FROM public.crawl_tasks WHERE id=p_task_id AND lease_token=p_token
 AND status='running' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Crawl lease expired'; END IF;
 IF jsonb_typeof(p_vectors)<>'array' OR jsonb_array_length(p_vectors)>100 OR octet_length(p_vectors::text)>2097152 THEN
  RAISE EXCEPTION 'Invalid vector batch';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_vectors) LOOP
  SELECT * INTO vacancy FROM public.jobs WHERE id=(item->>'job_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  current_facts:=jsonb_build_object('title',vacancy.title,'description',vacancy.description,'company',vacancy.company,
   'location',vacancy.location,'salary_text',vacancy.salary_text,'salary_min_amount',vacancy.salary_min_amount,
   'salary_max_amount',vacancy.salary_max_amount,'salary_currency',vacancy.salary_currency,'salary_period',vacancy.salary_period,
   'employment_type',vacancy.employment_type);
  IF current_facts IS DISTINCT FROM item->'expected_facts' THEN CONTINUE; END IF;
  IF item->'embedding'='null'::jsonb THEN
   DELETE FROM public.job_scoring_embeddings WHERE job_id=vacancy.id;
  ELSE
   vector_value:=(item->>'embedding')::extensions.vector;
   IF extensions.vector_dims(vector_value)<>384 OR extensions.vector_norm(vector_value)=0
    OR length(item->>'content_hash')<>64 OR length(item->>'model_version') NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid job vector';
   END IF;
   INSERT INTO public.job_scoring_embeddings(job_id,embedding,content_hash,model_version)
   VALUES(vacancy.id,vector_value,item->>'content_hash',item->>'model_version')
   ON CONFLICT(job_id) DO UPDATE SET embedding=excluded.embedding,content_hash=excluded.content_hash,
    model_version=excluded.model_version;
  END IF;
  stored:=stored+1;
 END LOOP;
 RETURN stored;
END $$;

CREATE FUNCTION public.purge_crawl_history()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE removed integer; runs_removed integer;
BEGIN
 DELETE FROM public.crawl_snapshots WHERE fetched_at<now()-interval '30 days'
 OR id IN (SELECT id FROM public.crawl_snapshots ORDER BY fetched_at DESC,id OFFSET 10000);
 GET DIAGNOSTICS removed=ROW_COUNT;
 DELETE FROM public.crawl_runs WHERE status<>'running' AND (finished_at<now()-interval '30 days'
 OR id IN (SELECT id FROM public.crawl_runs WHERE status<>'running' ORDER BY finished_at DESC,id OFFSET 100000));
 GET DIAGNOSTICS runs_removed=ROW_COUNT;
 RETURN removed+runs_removed;
END $$;
REVOKE ALL ON FUNCTION public.record_crawl_snapshot(uuid,uuid,jsonb),public.store_crawl_vectors(uuid,uuid,jsonb),public.purge_crawl_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_crawl_snapshot(uuid,uuid,jsonb),public.store_crawl_vectors(uuid,uuid,jsonb),public.purge_crawl_history() TO service_role;
