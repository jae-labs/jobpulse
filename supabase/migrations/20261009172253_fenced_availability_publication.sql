-- Fenced publication uses the invoker service grant and live lease; browser evidence writes stay forbidden.
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
   last_seen_at=now(),closed_at=CASE WHEN task.target->>'kind'='detail' THEN jobs.closed_at ELSE NULL END RETURNING * INTO saved;
  INSERT INTO public.job_occurrences(job_id,source_key,external_id,source_url,content_hash,snapshot_id)
  VALUES(saved.id,task.source_key,item->>'external_id',saved.url,item->>'content_hash',(item->>'snapshot_id')::uuid)
  ON CONFLICT(source_key,external_id) DO UPDATE SET job_id=excluded.job_id,source_url=excluded.source_url,
   content_hash=excluded.content_hash,last_seen_at=now(),snapshot_id=coalesce(excluded.snapshot_id,job_occurrences.snapshot_id);
  IF item->>'work_kind' IN ('detail','vector') THEN
   PERFORM public.enqueue_crawl((item->>'work_kind') || ':' || saved.id::text,
    jsonb_build_object('kind',item->>'work_kind','job_id',saved.id),20);
  END IF;
  IF coalesce(task.target->>'kind','source') NOT IN ('detail','vector') THEN
   UPDATE public.jobs SET availability_status='active',availability_checked_at=now(),
    availability_evidence='published_listing',closed_at=NULL WHERE id=saved.id RETURNING * INTO saved;
  END IF;
  RETURN NEXT saved;
 END LOOP;
END $$;
