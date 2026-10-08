-- Scheduling preserves in-flight targets and durable retry budgets.
CREATE OR REPLACE FUNCTION public.enqueue_crawl(p_source_key text,p_target jsonb,p_priority integer DEFAULT 50,p_due timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE task_id uuid;
BEGIN
 INSERT INTO public.crawl_tasks(source_key,target,priority,next_fetch_at)
 VALUES(p_source_key,p_target,p_priority,p_due)
 ON CONFLICT(source_key) DO UPDATE SET
 target=CASE WHEN crawl_tasks.status IN ('pending','running') THEN crawl_tasks.target ELSE EXCLUDED.target END,
 priority=CASE WHEN crawl_tasks.status IN ('pending','running') THEN crawl_tasks.priority ELSE EXCLUDED.priority END,
 status=CASE WHEN crawl_tasks.status IN ('pending','running') THEN crawl_tasks.status ELSE 'pending' END,
 attempt=CASE WHEN crawl_tasks.status IN ('pending','running') THEN crawl_tasks.attempt ELSE 0 END,
 next_fetch_at=CASE WHEN crawl_tasks.status='running' THEN crawl_tasks.next_fetch_at
 WHEN crawl_tasks.status='pending' THEN greatest(crawl_tasks.next_fetch_at,EXCLUDED.next_fetch_at)
 ELSE EXCLUDED.next_fetch_at END,
 updated_at=now() RETURNING id INTO task_id;
 RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_crawl(text,jsonb,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_crawl(text,jsonb,integer,timestamptz) TO service_role;
