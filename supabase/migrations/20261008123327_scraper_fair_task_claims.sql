-- Rotate due source, detail and vector work; supported sources share turns with discovery.
CREATE OR REPLACE FUNCTION public.claim_crawl(p_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.crawl_tasks LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE task public.crawl_tasks; token uuid; last_kind text; wanted text; prefer_discovery boolean;
 native_providers text[]:=ARRAY['greenhouse','lever','ashby','jsonld','bamboohr','workable','recruitee',
 'pinpoint','breezy','amazon','lidl','housing_agency','kildare','ida','workday','smartrecruiters',
 'rippling','rezoomo','ukg','manatal','personio','hubspot'];
BEGIN
 IF p_lease_seconds<10 OR p_lease_seconds>3600 THEN RAISE EXCEPTION 'Invalid crawl lease'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('jobpulse:crawl:fair-claim',0));
 SELECT coalesce(t.target->>'kind','source') INTO last_kind
 FROM public.crawl_runs r JOIN public.crawl_tasks t ON t.id=r.task_id
 ORDER BY r.started_at DESC,r.id DESC LIMIT 1;
 wanted:=CASE last_kind WHEN 'source' THEN 'detail' WHEN 'detail' THEN 'vector' ELSE 'source' END;
 SELECT count(*)=3 AND bool_and(provider=ANY(native_providers)) INTO prefer_discovery FROM (
  SELECT t.target->>'provider' AS provider FROM public.crawl_runs r JOIN public.crawl_tasks t ON t.id=r.task_id
  WHERE coalesce(t.target->>'kind','source') NOT IN ('detail','vector')
  ORDER BY r.started_at DESC,r.id DESC LIMIT 3
 ) recent;
 LOOP
 SELECT * INTO task FROM public.crawl_tasks
 WHERE (status='pending' AND next_fetch_at<=now()) OR (status='running' AND lease_until<=now())
 ORDER BY CASE WHEN coalesce(target->>'kind','source')=wanted THEN 0 ELSE 1 END,
 CASE WHEN coalesce(target->>'kind','source') NOT IN ('detail','vector') THEN
  CASE WHEN coalesce(target->>'provider'=ANY(native_providers),false) IS DISTINCT FROM coalesce(prefer_discovery,false)
   THEN 0 ELSE 1 END ELSE 0 END,
 next_fetch_at,priority DESC,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 IF task.status='running' THEN
  UPDATE public.crawl_runs SET status='expired',finished_at=now() WHERE lease_token=task.lease_token AND status='running';
 END IF;
 IF task.attempt>=task.max_attempts THEN
  UPDATE public.crawl_tasks SET status='dead',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=task.id;
  CONTINUE;
 END IF;
 EXIT;
 END LOOP;
 token:=gen_random_uuid();
 UPDATE public.crawl_tasks SET status='running',attempt=attempt+1,lease_token=token,
 lease_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() WHERE id=task.id RETURNING * INTO task;
 INSERT INTO public.crawl_runs(task_id,lease_token,attempt) VALUES(task.id,token,task.attempt);
 RETURN NEXT task;
END $$;
REVOKE ALL ON FUNCTION public.claim_crawl(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_crawl(integer) TO service_role;
