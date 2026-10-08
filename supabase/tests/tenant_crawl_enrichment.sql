-- Atomic enrichment scheduling, snapshot retention and vector input fencing.
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
UPDATE public.crawl_tasks SET next_fetch_at=now()+interval '1 day',
 lease_until=CASE WHEN status='running' THEN now()+interval '1 day' ELSE lease_until END;
DO $$
DECLARE task public.crawl_tasks; job public.jobs; snapshot uuid; facts jsonb; vectors jsonb; pending_id uuid;
BEGIN
 PERFORM public.enqueue_crawl('synthetic:enrichment','{"employer":"Synthetic"}',100,now()-interval '1 day');
 SELECT * INTO task FROM public.claim_crawl(120);
 snapshot:=public.record_crawl_snapshot(task.id,task.lease_token,jsonb_build_object(
 'url','https://example.invalid/listing','status',200,'content_hash',repeat('a',64),
 'body_key',repeat('a',64)||'.bin','body_bytes',42,'parser_version','synthetic:v1','replay_key',repeat('b',64)||'.json'));
 SELECT * INTO job FROM public.persist_crawl_jobs(task.id,task.lease_token,jsonb_build_array(jsonb_build_object(
 'job',jsonb_build_object('dedupe_key','synthetic-enrichment-job','title','Synthetic Engineer','company','Synthetic',
 'location','Dublin','employment_type','Permanent','description',repeat('Synthetic published body. ',30),
 'url','https://example.invalid/job/2','source','Synthetic'),'external_id','2','content_hash',repeat('c',64),
 'snapshot_id',snapshot,'work_kind','vector')));
 IF NOT EXISTS(SELECT 1 FROM public.crawl_tasks WHERE source_key='vector:'||job.id::text AND target->>'kind'='vector') THEN
  RAISE EXCEPTION 'Catalog persistence did not atomically enqueue vector preparation';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_occurrences WHERE job_id=job.id AND snapshot_id=snapshot) THEN
  RAISE EXCEPTION 'Source occurrence lost snapshot link';
 END IF;
 facts:=jsonb_build_object('title',job.title,'description',job.description,'company',job.company,'location',job.location,
 'salary_text',job.salary_text,'salary_min_amount',job.salary_min_amount,'salary_max_amount',job.salary_max_amount,
 'salary_currency',job.salary_currency,'salary_period',job.salary_period,'employment_type',job.employment_type);
 vectors:=jsonb_build_array(jsonb_build_object('job_id',job.id,'expected_facts',facts,'content_hash',repeat('d',64),
 'model_version','synthetic:384','embedding',('[1,'||repeat('0,',382)||'0]')::jsonb));
 IF public.store_crawl_vectors(task.id,task.lease_token,vectors)<>1 THEN RAISE EXCEPTION 'Current job vector rejected'; END IF;
 UPDATE public.jobs SET description='Different published facts' WHERE id=job.id;
 IF public.store_crawl_vectors(task.id,task.lease_token,vectors)<>0 THEN RAISE EXCEPTION 'Stale job vector accepted'; END IF;
 -- A listing stub cannot erase a concurrently hydrated catalog body.
 PERFORM public.persist_crawl_jobs(task.id,task.lease_token,jsonb_build_array(jsonb_build_object(
 'job',jsonb_build_object('dedupe_key',job.dedupe_key,'title',job.title,'company',job.company,'location',job.location,
 'employment_type',job.employment_type,'description','','url',job.url,'source',job.source),
 'external_id','2','content_hash',repeat('e',64),'work_kind','detail')));
 IF (SELECT description FROM public.jobs WHERE id=job.id)<>'Different published facts' THEN RAISE EXCEPTION 'Stub erased body'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crawl_tasks WHERE source_key='detail:'||job.id::text) THEN RAISE EXCEPTION 'Detail work lost'; END IF;
 UPDATE public.crawl_snapshots SET fetched_at=now()-interval '31 days' WHERE id=snapshot;
 PERFORM public.purge_crawl_history();
 IF EXISTS(SELECT 1 FROM public.crawl_snapshots WHERE id=snapshot) OR
 NOT EXISTS(SELECT 1 FROM public.job_occurrences WHERE job_id=job.id AND snapshot_id IS NULL) THEN
  RAISE EXCEPTION 'Snapshot retention lost provenance or retained expired body reference';
 END IF;
 UPDATE public.crawl_tasks SET lease_until=now()-interval '1 second' WHERE id=task.id;
 BEGIN
  PERFORM public.store_crawl_vectors(task.id,task.lease_token,vectors);
  RAISE EXCEPTION 'Expired vector worker accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Crawl lease expired' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$
DECLARE uid uuid; relation_name text;
BEGIN
 FOREACH uid IN ARRAY ARRAY['a1111111-1111-4111-8111-111111111111'::uuid,'b2222222-2222-4222-8222-222222222222'::uuid] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.store_crawl_vectors(gen_random_uuid(),gen_random_uuid(),'[]'); RAISE EXCEPTION 'Browser vector work allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.record_crawl_snapshot(gen_random_uuid(),gen_random_uuid(),'{}'); RAISE EXCEPTION 'Browser snapshot work allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.purge_crawl_history(); RAISE EXCEPTION 'Browser retention work allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  FOREACH relation_name IN ARRAY ARRAY['crawl_tasks','crawl_runs','crawl_snapshots','job_occurrences'] LOOP
   BEGIN EXECUTE format('INSERT INTO public.%I DEFAULT VALUES',relation_name); RAISE EXCEPTION 'Browser operational insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  RESET ROLE;
 END LOOP;
 SET LOCAL ROLE anon;
 BEGIN PERFORM public.store_crawl_vectors(gen_random_uuid(),gen_random_uuid(),'[]'); RAISE EXCEPTION 'Anonymous vector work allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.record_crawl_snapshot(gen_random_uuid(),gen_random_uuid(),'{}'); RAISE EXCEPTION 'Anonymous snapshot work allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.purge_crawl_history(); RAISE EXCEPTION 'Anonymous retention work allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
END $$;
