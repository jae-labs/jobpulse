-- Completed sources wait six hours before automatic refresh; retries keep their own dates.
ALTER TABLE public.crawl_tasks ADD COLUMN last_succeeded_at timestamptz;
UPDATE public.crawl_tasks t SET last_succeeded_at=coalesce(
 (SELECT max(r.finished_at) FROM public.crawl_runs r WHERE r.task_id=t.id AND r.status='complete'),
 CASE WHEN t.status='complete' THEN t.updated_at END);

CREATE OR REPLACE FUNCTION public.finish_crawl(p_task_id uuid,p_token uuid,p_status text,p_result jsonb,p_retry_at timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE task public.crawl_tasks;
BEGIN
 IF p_status NOT IN ('complete','incomplete','blocked') THEN RAISE EXCEPTION 'Invalid crawl status'; END IF;
 SELECT * INTO task FROM public.crawl_tasks WHERE id=p_task_id AND lease_token=p_token
 AND status='running' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.crawl_runs SET status=p_status,result=p_result,finished_at=now() WHERE lease_token=p_token;
 UPDATE public.crawl_tasks SET status=CASE WHEN p_status='complete' THEN 'complete'
 WHEN attempt>=max_attempts THEN 'dead' ELSE 'pending' END,
 next_fetch_at=coalesce(p_retry_at,now()+make_interval(secs=>least(86400,60*(2^least(attempt,10))::integer))),
 lease_token=NULL,lease_until=NULL,updated_at=now(),
 last_succeeded_at=CASE WHEN p_status='complete' THEN now() ELSE last_succeeded_at END WHERE id=p_task_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_crawl(uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_crawl(uuid,uuid,text,jsonb,timestamptz) TO service_role;

-- Automatic startup seeds sources only when no durable work is unfinished.
CREATE OR REPLACE FUNCTION public.enqueue_crawls_if_idle(p_targets jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; queued integer:=0;
BEGIN
 IF p_targets IS NULL OR jsonb_typeof(p_targets)<>'array' THEN
  RAISE EXCEPTION 'Crawl targets must be an array' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_targets)>1000 OR octet_length(p_targets::text)>8388608 THEN
  RAISE EXCEPTION 'Crawl startup exceeds target budget' USING ERRCODE='22023';
 END IF;
 -- Serialize automatic starters; seeded tasks commit together before workers can claim them.
 PERFORM pg_advisory_xact_lock(hashtextextended('jobpulse:crawl:idle-start',0));
 IF EXISTS(SELECT 1 FROM public.crawl_tasks WHERE status IN ('pending','running')) THEN
  RETURN 0;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
  IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'target') IS DISTINCT FROM 'object'
   OR (item ? 'priority' AND (jsonb_typeof(item->'priority') IS DISTINCT FROM 'number'
     OR (item->>'priority') !~ '^[0-9]{1,3}$')) THEN
   RAISE EXCEPTION 'Invalid crawl target' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.crawl_tasks WHERE source_key=item->>'source_key'
    AND (status='dead' OR (status='complete'
      AND coalesce(last_succeeded_at,updated_at)>now()-interval '6 hours'))) THEN
   CONTINUE;
  END IF;
  PERFORM public.enqueue_crawl(item->>'source_key',item->'target',coalesce((item->>'priority')::integer,50));
  queued:=queued+1;
 END LOOP;
 RETURN queued;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_crawls_if_idle(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_crawls_if_idle(jsonb) TO service_role;
