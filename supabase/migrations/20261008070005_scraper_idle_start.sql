-- Automatic startup seeds sources only when no durable work is unfinished.
CREATE FUNCTION public.enqueue_crawls_if_idle(p_targets jsonb)
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
  PERFORM public.enqueue_crawl(item->>'source_key',item->'target',coalesce((item->>'priority')::integer,50));
  queued:=queued+1;
 END LOOP;
 RETURN queued;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_crawls_if_idle(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_crawls_if_idle(jsonb) TO service_role;
