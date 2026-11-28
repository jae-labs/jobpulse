-- Durable crawl fencing and operational data are service-only contracts.
RESET ROLE;
CREATE TEMP TABLE crawl_test_state(task_id uuid, token uuid);
GRANT ALL ON crawl_test_state TO service_role,authenticated,anon;
SET LOCAL ROLE service_role;
-- Changes to existing queue scheduling are rollback-only fixture isolation.
UPDATE public.crawl_tasks SET next_fetch_at=now()+interval '1 day',
 lease_until=CASE WHEN status='running' THEN now()+interval '1 day' ELSE lease_until END;
INSERT INTO crawl_test_state(task_id) SELECT public.enqueue_crawl('synthetic:test','{"provider":"jsonld","company":"Synthetic","url":"https://example.invalid"}');
DO $$
DECLARE task public.crawl_tasks; current_token uuid;
BEGIN
 SELECT * INTO task FROM public.claim_crawl(120);
 IF task.id IS DISTINCT FROM (SELECT task_id FROM crawl_test_state) OR task.attempt<>1 THEN
  RAISE EXCEPTION 'Crawl claim lost or duplicated task';
 END IF;
 UPDATE crawl_test_state SET token=task.lease_token;
 IF public.finish_crawl(task.id,gen_random_uuid(),'complete','{}') THEN RAISE EXCEPTION 'Forged lease accepted'; END IF;
 IF task.last_succeeded_at IS NOT NULL THEN RAISE EXCEPTION 'New task has successful completion evidence'; END IF;
 IF (SELECT count(*) FROM public.persist_crawl_jobs(task.id,task.lease_token,
 '[{"job":{"dedupe_key":"synthetic-crawl-job","title":"Synthetic Engineer","company":"Synthetic","location":"Dublin","employment_type":"Permanent","description":"Published synthetic role","url":"https://example.invalid/job/1","source":"Synthetic"},"external_id":"1","content_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'))<>1 THEN
  RAISE EXCEPTION 'Fenced batch did not persist';
 END IF;
 IF (SELECT count(*) FROM public.job_occurrences WHERE source_key='synthetic:test' AND external_id='1')<>1 THEN
  RAISE EXCEPTION 'Source occurrence missing';
 END IF;
 IF NOT public.renew_crawl(task.id,task.lease_token,120) THEN RAISE EXCEPTION 'Current lease cannot renew'; END IF;
 UPDATE public.crawl_tasks SET lease_until=now()-interval '1 second' WHERE id=task.id;
 IF public.finish_crawl(task.id,task.lease_token,'complete','{}') THEN RAISE EXCEPTION 'Expired lease accepted'; END IF;
 BEGIN
  PERFORM public.persist_crawl_jobs(task.id,task.lease_token,'[]');
  RAISE EXCEPTION 'Expired worker persisted jobs';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Crawl lease expired' THEN RAISE; END IF;
 END;
 current_token:=task.lease_token;
 SELECT * INTO task FROM public.claim_crawl(120);
 IF task.lease_token=current_token OR task.attempt<>2 THEN RAISE EXCEPTION 'Expired work not reclaimed'; END IF;
 IF (SELECT status FROM public.crawl_runs WHERE lease_token=current_token)<>'expired' THEN RAISE EXCEPTION 'Expired run not recorded'; END IF;
 IF public.renew_crawl(task.id,current_token,120) THEN RAISE EXCEPTION 'Stale worker renewed another lease'; END IF;
 IF public.finish_crawl(task.id,current_token,'complete','{}') THEN RAISE EXCEPTION 'Stale worker completed another lease'; END IF;
 IF NOT public.finish_crawl(task.id,task.lease_token,'incomplete','{"persisted":1}',now()+interval '1 hour') THEN RAISE EXCEPTION 'Current worker cannot finish'; END IF;
 PERFORM public.enqueue_crawl('synthetic:test','{"employer":"Changed synthetic target"}',100,now());
 IF (SELECT attempt FROM public.crawl_tasks WHERE id=task.id)<>2 THEN RAISE EXCEPTION 'Repeated scheduling erased retry attempts'; END IF;
 IF (SELECT target FROM public.crawl_tasks WHERE id=task.id)->>'company' IS DISTINCT FROM 'Synthetic' THEN RAISE EXCEPTION 'Repeated scheduling changed pending target'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_crawl(120)) THEN RAISE EXCEPTION 'Retry date bypassed'; END IF;
END $$;
RESET ROLE;
-- Only successful fenced completion advances source freshness.
SET LOCAL ROLE service_role;
DO $$
DECLARE task public.crawl_tasks; succeeded timestamptz;
BEGIN
 UPDATE public.crawl_tasks SET status='complete',lease_token=NULL,lease_until=NULL;
 PERFORM public.enqueue_crawl('synthetic:freshness','{"employer":"Synthetic"}',100,'1970-01-01');
 SELECT * INTO task FROM public.claim_crawl(120);
 IF NOT public.finish_crawl(task.id,task.lease_token,'complete','{}') THEN RAISE EXCEPTION 'Freshness fixture did not finish'; END IF;
 SELECT last_succeeded_at INTO succeeded FROM public.crawl_tasks WHERE id=task.id;
 IF succeeded IS DISTINCT FROM now() THEN RAISE EXCEPTION 'Successful finish did not record freshness'; END IF;
 PERFORM public.enqueue_crawl('synthetic:freshness','{"employer":"Synthetic"}',100,'1970-01-01');
 SELECT * INTO task FROM public.claim_crawl(120);
 IF NOT public.finish_crawl(task.id,task.lease_token,'incomplete','{}',now()+interval '10 minutes') THEN RAISE EXCEPTION 'Retry fixture did not finish'; END IF;
 IF (SELECT last_succeeded_at FROM public.crawl_tasks WHERE id=task.id) IS DISTINCT FROM succeeded THEN RAISE EXCEPTION 'Failed retry changed successful freshness'; END IF;
 IF (SELECT next_fetch_at FROM public.crawl_tasks WHERE id=task.id) IS DISTINCT FROM now()+interval '6 hours' THEN RAISE EXCEPTION 'Short source retry bypassed six-hour minimum'; END IF;
 UPDATE public.crawl_tasks SET next_fetch_at='1970-01-01' WHERE id=task.id;
 SELECT * INTO task FROM public.claim_crawl(120);
 IF NOT public.finish_crawl(task.id,task.lease_token,'blocked','{}',now()+interval '8 hours') THEN RAISE EXCEPTION 'Long denial fixture did not finish'; END IF;
 IF (SELECT next_fetch_at FROM public.crawl_tasks WHERE id=task.id) IS DISTINCT FROM now()+interval '8 hours' THEN RAISE EXCEPTION 'Long remote delay was shortened'; END IF;
 PERFORM public.enqueue_crawl('synthetic:detail-retry','{"kind":"detail","job_id":-1}',100,'1970-01-01');
 SELECT * INTO task FROM public.claim_crawl(120);
 IF NOT public.finish_crawl(task.id,task.lease_token,'incomplete','{}',now()+interval '10 minutes') THEN RAISE EXCEPTION 'Detail retry fixture did not finish'; END IF;
 IF (SELECT next_fetch_at FROM public.crawl_tasks WHERE id=task.id) IS DISTINCT FROM now()+interval '10 minutes' THEN RAISE EXCEPTION 'Source delay leaked into detail retries'; END IF;

END $$;
RESET ROLE;
-- Consolidation preserves public observations and private candidate tracking.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.jobs(id,dedupe_key,title,company,location,description,url,source)
VALUES(-970001,'synthetic-crawl-keeper','Synthetic Engineer','Synthetic','Dublin','Synthetic body','https://example.invalid/merge','Synthetic'),
(-970002,'synthetic-crawl-duplicate','Synthetic Engineer','Synthetic','Dublin','Synthetic body','https://example.invalid/merge','Synthetic');
INSERT INTO public.user_job_statuses(user_id,job_id,status,is_saved)
VALUES('a1111111-1111-4111-8111-111111111111',-970002,'applied',true),
('b2222222-2222-4222-8222-222222222222',-970002,'not_interested',false);
INSERT INTO public.job_occurrences(job_id,source_key,external_id,source_url,content_hash)
VALUES(-970002,'synthetic:merge','2','https://example.invalid/merge',repeat('b',64));
SET LOCAL ROLE service_role;
DO $$
BEGIN
 IF public.merge_duplicate_catalog_jobs(-970001,ARRAY[-970002]::bigint[],'synthetic-crawl-merged')<>1 THEN
  RAISE EXCEPTION 'Source deduplication did not consolidate';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_occurrences WHERE source_key='synthetic:merge' AND job_id=-970001) THEN
  RAISE EXCEPTION 'Deduplication lost source provenance';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_job_statuses WHERE job_id=-970001 AND status='applied' AND is_saved) THEN
  RAISE EXCEPTION 'Deduplication lost candidate tracking';
 END IF;
END $$;
RESET ROLE;
INSERT INTO public.jobs(id,dedupe_key,title,company,location,description,url,source)
VALUES(-970003,'synthetic-conflict-keeper','Synthetic role','Synthetic','Dublin','Synthetic body','https://example.invalid/job/2','Synthetic'),
(-970004,'synthetic-conflict-duplicate','Synthetic role','Synthetic','Dublin','Synthetic body','https://example.invalid/job/2','Synthetic');
INSERT INTO public.user_job_statuses(user_id,job_id,status,is_saved)
VALUES('a1111111-1111-4111-8111-111111111111',-970003,'applied',false),
('a1111111-1111-4111-8111-111111111111',-970004,'rejected',true),
('b2222222-2222-4222-8222-222222222222',-970004,'interviewing',true);
SET LOCAL ROLE service_role;
DO $$
BEGIN
 IF public.merge_duplicate_catalog_jobs(-970003,ARRAY[-970004]::bigint[],'synthetic-conflict-keeper')<>0 THEN
  RAISE EXCEPTION 'Conflicting candidate stages merged';
 END IF;
 IF (SELECT count(*) FROM public.jobs WHERE id IN (-970003,-970004))<>2
 OR (SELECT count(*) FROM public.user_job_statuses WHERE job_id IN (-970003,-970004))<>3 THEN
  RAISE EXCEPTION 'Blocked merge changed jobs or another candidate tracking';
 END IF;
END $$;
RESET ROLE;
DO $$
DECLARE uid uuid; relation_name text; function_name text;
BEGIN
 FOREACH uid IN ARRAY ARRAY['a1111111-1111-4111-8111-111111111111'::uuid,'b2222222-2222-4222-8222-222222222222'::uuid] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.user_job_statuses WHERE job_id=-970001 AND user_id=uid)<>1 THEN
   RAISE EXCEPTION 'Candidate lost own tracking during source alias merge';
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_job_statuses WHERE job_id=-970001 AND user_id<>uid) THEN
   RAISE EXCEPTION 'Merged tracking exposed another candidate';
  END IF;
  BEGIN PERFORM public.merge_duplicate_catalog_jobs(-970003,ARRAY[-970004]::bigint[],'forged-merge');
   RAISE EXCEPTION 'Browser merged guessed catalog identities';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  FOREACH relation_name IN ARRAY ARRAY['crawl_tasks','crawl_runs','crawl_snapshots','job_occurrences'] LOOP
   BEGIN EXECUTE format('SELECT * FROM public.%I',relation_name); RAISE EXCEPTION 'Browser read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN EXECUTE format('UPDATE public.%I SET source_key=source_key',relation_name); RAISE EXCEPTION 'Browser update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN undefined_column THEN
    BEGIN UPDATE public.crawl_runs SET result=result; RAISE EXCEPTION 'Browser run update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END;
   BEGIN EXECUTE format('DELETE FROM public.%I',relation_name); RAISE EXCEPTION 'Browser delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN PERFORM public.persist_crawl_jobs((SELECT task_id FROM crawl_test_state),(SELECT token FROM crawl_test_state),'[]'); RAISE EXCEPTION 'Browser persisted crawl'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.claim_crawl(120); RAISE EXCEPTION 'Browser claimed service work'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.enqueue_crawls_if_idle('[]'); RAISE EXCEPTION 'Browser auto-start allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.enqueue_crawl('forged','{}'); RAISE EXCEPTION 'Browser enqueued service work'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.finish_crawl((SELECT task_id FROM crawl_test_state),(SELECT token FROM crawl_test_state),'complete','{}'); RAISE EXCEPTION 'Browser completed guessed work'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
 END LOOP;
 SET LOCAL ROLE anon;
 BEGIN PERFORM public.merge_duplicate_catalog_jobs(-970003,ARRAY[-970004]::bigint[],'anonymous-merge');
  RAISE EXCEPTION 'Anonymous catalog merge allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.claim_crawl(120); RAISE EXCEPTION 'Anonymous claim allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.enqueue_crawls_if_idle('[]'); RAISE EXCEPTION 'Anonymous auto-start allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.enqueue_crawl('forged','{}'); RAISE EXCEPTION 'Anonymous enqueue allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
END $$;

-- Eligibility is per source; future retries never block other source refreshes.
SET LOCAL ROLE service_role;
DO $$
DECLARE input jsonb:='[{"source_key":"synthetic:auto-start","target":{"employer":"Synthetic"},"priority":50}]'; seeded uuid; peer uuid; due timestamptz; attempts integer;
BEGIN
 SELECT id,next_fetch_at,attempt INTO peer,due,attempts FROM public.crawl_tasks
 WHERE source_key='synthetic:freshness';
 IF due<now()+interval '6 hours' THEN RAISE EXCEPTION 'Failed source retry did not wait six hours'; END IF;
 IF public.enqueue_crawls_if_idle(input)<>1 THEN RAISE EXCEPTION 'Unrelated future retry blocked an eligible source'; END IF;
 IF (SELECT next_fetch_at FROM public.crawl_tasks WHERE id=peer) IS DISTINCT FROM due
  OR (SELECT attempt FROM public.crawl_tasks WHERE id=peer) IS DISTINCT FROM attempts THEN
  RAISE EXCEPTION 'Peer scheduling changed failed work';
 END IF;
 SELECT id INTO seeded FROM public.crawl_tasks WHERE source_key='synthetic:auto-start';
 IF public.enqueue_crawls_if_idle(input)<>0 THEN RAISE EXCEPTION 'Second automatic start duplicated work'; END IF;
 UPDATE public.crawl_tasks SET next_fetch_at=now()+interval '1 day' WHERE id=seeded;
 IF public.enqueue_crawls_if_idle(input)<>0 THEN RAISE EXCEPTION 'Future pending retry reset'; END IF;
 UPDATE public.crawl_tasks SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute' WHERE id=seeded;
 IF public.enqueue_crawls_if_idle(input)<>0 THEN RAISE EXCEPTION 'Running source reset'; END IF;
 UPDATE public.crawl_tasks SET status='complete',lease_token=NULL,lease_until=NULL WHERE id=seeded;
 IF public.enqueue_crawls_if_idle(input)<>0 THEN RAISE EXCEPTION 'Recent completion bypassed six-hour refresh interval'; END IF;
 UPDATE public.crawl_tasks SET last_succeeded_at=now()-interval '6 hours' WHERE id=seeded;
 IF public.enqueue_crawls_if_idle(input)<>1 THEN RAISE EXCEPTION 'Unrelated retry blocked an elapsed source refresh'; END IF;
 UPDATE public.crawl_tasks SET status='dead' WHERE id=seeded;
 IF public.enqueue_crawls_if_idle(input)<>0 THEN RAISE EXCEPTION 'Automatic startup revived exhausted retries'; END IF;
 BEGIN PERFORM public.enqueue_crawls_if_idle('{}'); RAISE EXCEPTION 'Invalid auto-start input allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
