-- Fair claiming preserves due dates, ownership fencing and service-only access.
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.crawl_tasks SET next_fetch_at=now()+interval '2 days',
 lease_until=CASE WHEN status='running' THEN now()+interval '2 days' ELSE lease_until END;
DO $$
DECLARE task public.crawl_tasks; baseline uuid; claimed uuid; i integer;
 native uuid; detail uuid; vector uuid; discovery uuid;
BEGIN
 FOR i IN 1..3 LOOP
  baseline:=public.enqueue_crawl('synthetic:fair-history-'||i,'{"provider":"generic"}');
  UPDATE public.crawl_tasks SET status='complete' WHERE id=baseline;
  INSERT INTO public.crawl_runs(task_id,lease_token,attempt,status,started_at,finished_at)
  VALUES(baseline,gen_random_uuid(),1,'complete',now()+interval '1 day'-i*interval '1 second',now());
 END LOOP;
 baseline:=public.enqueue_crawl('synthetic:fair-baseline','{"kind":"vector","job_id":1}');
 UPDATE public.crawl_tasks SET status='complete' WHERE id=baseline;
 INSERT INTO public.crawl_runs(task_id,lease_token,attempt,status,started_at,finished_at)
 VALUES(baseline,gen_random_uuid(),1,'complete',now()+interval '1 day',now());
 native:=public.enqueue_crawl('synthetic:fair-native','{"provider":"greenhouse","employer":"Synthetic"}',10);
 discovery:=public.enqueue_crawl('synthetic:fair-discovery','{"provider":"generic","employer":"Synthetic"}',100,'1970-01-01');
 detail:=public.enqueue_crawl('synthetic:fair-detail','{"kind":"detail","job_id":1}',20);
 vector:=public.enqueue_crawl('synthetic:fair-vector','{"kind":"vector","job_id":1}',20);
 FOR i IN 1..3 LOOP
  SELECT * INTO task FROM public.claim_crawl(120);
  claimed:=CASE i WHEN 1 THEN native WHEN 2 THEN detail ELSE vector END;
  IF task.id IS DISTINCT FROM claimed THEN RAISE EXCEPTION 'Source/detail/vector fairness failed at slot %',i; END IF;
  UPDATE public.crawl_runs SET started_at=now()+interval '1 day'+i*interval '1 second' WHERE lease_token=task.lease_token;
  IF public.finish_crawl(task.id,gen_random_uuid(),'complete','{}') THEN RAISE EXCEPTION 'Forged fair completion accepted'; END IF;
  IF NOT public.finish_crawl(task.id,task.lease_token,'complete','{}') THEN RAISE EXCEPTION 'Fair completion lost lease'; END IF;
 END LOOP;
 -- Three consecutive native source turns yield to waiting discovery.
 FOR i IN 4..5 LOOP
  PERFORM public.enqueue_crawl('synthetic:fair-native-'||i,'{"provider":"lever","employer":"Synthetic"}',10);
  SELECT * INTO task FROM public.claim_crawl(120);
  IF task.id=discovery THEN RAISE EXCEPTION 'Native quota yielded too soon'; END IF;
  UPDATE public.crawl_runs SET started_at=now()+interval '1 day'+i*interval '1 second' WHERE lease_token=task.lease_token;
  PERFORM public.finish_crawl(task.id,task.lease_token,'complete','{}');
 END LOOP;
 PERFORM public.enqueue_crawl('synthetic:fair-native-more','{"provider":"lever","employer":"Synthetic"}',100);
 SELECT * INTO task FROM public.claim_crawl(120);
 IF task.id IS DISTINCT FROM discovery THEN RAISE EXCEPTION 'Generic discovery starved'; END IF;
 PERFORM public.finish_crawl(task.id,task.lease_token,'incomplete','{}');
 IF (SELECT next_fetch_at FROM public.crawl_tasks WHERE id=discovery)<now()+interval '6 hours' THEN
  RAISE EXCEPTION 'Fair claims weakened failed-source retry interval';
 END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.claim_crawl(120); RAISE EXCEPTION 'Anonymous fair claim accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.claim_crawl(120); RAISE EXCEPTION 'Browser fair claim accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
