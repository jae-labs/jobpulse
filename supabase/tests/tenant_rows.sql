-- Mirror the Storage API's deletion flag; RLS remains enabled for all row probes.
SELECT set_config('storage.allow_delete_query','true',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE caller uuid; other_user uuid; t text; changed bigint; inserted_owner uuid; p jsonb; page jsonb; metrics jsonb; item jsonb;
BEGIN
 FOREACH caller IN ARRAY ARRAY['a1111111-1111-4111-8111-111111111111'::uuid,'b2222222-2222-4222-8222-222222222222'::uuid] LOOP
  other_user:=CASE WHEN caller='a1111111-1111-4111-8111-111111111111' THEN
   'b2222222-2222-4222-8222-222222222222'::uuid ELSE 'a1111111-1111-4111-8111-111111111111'::uuid END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller,'role','authenticated')::text,true);
  PERFORM pg_temp.assert_private_visibility(caller,other_user);
  PERFORM pg_temp.assert_private_writes(caller);
  FOR t IN SELECT table_name FROM tenant_contract WHERE access_kind='owner' LOOP
   EXECUTE format('UPDATE public.%I SET user_id=user_id WHERE user_id=$1',t) USING other_user;
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed<>0 THEN RAISE EXCEPTION 'Tenant guard: foreign UPDATE on %',t; END IF;
   EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',t) USING other_user;
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed<>0 THEN RAISE EXCEPTION 'Tenant guard: foreign DELETE on %',t; END IF;
   -- Ownership reassignment must be rejected or rewritten to the active identity.
   BEGIN
    EXECUTE format('UPDATE public.%I SET user_id=$1 WHERE user_id=$2 RETURNING user_id',t)
      INTO inserted_owner USING other_user,caller;
    IF inserted_owner IS DISTINCT FROM caller THEN
     RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: ownership reassignment on ' || t;
    END IF;
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   SELECT payload || jsonb_build_object('user_id','c3333333-3333-4333-8333-333333333333',
     'id',CASE WHEN caller::text LIKE 'a%' THEN -910098 ELSE -910097 END)
     INTO p FROM tenant_insert_payloads WHERE table_name=t;
   IF p ? 'job_id' THEN p:=p || '{"job_id":-910002}'; END IF;
   IF p ? 'ai_analysis' THEN p:=p || '{"ai_analysis":{},"matched_skills":[]}'; END IF;
   IF p ? 'status' THEN p:=p || '{"status":"new"}'; END IF;
   IF p ? 'storage_path' THEN
    p:=p || jsonb_build_object('storage_path',caller::text || '/probe/' || t || '.pdf');
   END IF;
   BEGIN
    -- No RETURNING: SELECT RLS must not mask a permissive INSERT policy.
    EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I,$1)).*',t,t) USING p;
    EXECUTE format('SELECT user_id FROM public.%I WHERE id=$1',t) INTO inserted_owner USING (p->>'id')::bigint;
    IF inserted_owner IS DISTINCT FROM caller THEN
     RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: foreign INSERT on ' || t;
    END IF;
   EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN unique_violation THEN
     -- Only a rewritten profile INSERT legitimately collides with the caller's existing profile.
     IF t <> 'user_profiles' THEN RAISE; END IF;
   END;
  END LOOP;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('avatars','user-documents') AND name LIKE other_user::text || '/%')<>0
     OR (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('avatars','user-documents') AND name LIKE caller::text || '/%')<>2 THEN
   RAISE EXCEPTION 'Tenant guard: Storage read isolation failed';
  END IF;
  UPDATE storage.objects SET name=name WHERE name LIKE other_user::text || '/%';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Tenant guard: foreign Storage UPDATE'; END IF;
  DELETE FROM storage.objects WHERE name LIKE other_user::text || '/%';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Tenant guard: foreign Storage DELETE'; END IF;
  BEGIN
   INSERT INTO storage.objects(bucket_id,name) VALUES('avatars',other_user::text || '/forged');
   RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: foreign Storage INSERT';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   UPDATE storage.objects SET name=other_user::text || '/moved-avatar'
    WHERE bucket_id='avatars' AND name=caller::text || '/avatar';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed<>0 THEN
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: Storage ownership reassignment';
   END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   PERFORM public.rescore_user(other_user,1);
   RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: foreign rescore RPC';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;
  -- Shared catalog is readable, but browsers cannot mutate it.
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=-910001) THEN
   RAISE EXCEPTION 'Tenant guard: authorized shared catalog read was denied';
  END IF;
  UPDATE public.jobs SET title=title WHERE id=-910001;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Tenant guard: shared catalog browser UPDATE'; END IF;
  page:=public.get_jobs_page(p_search=>'TenantGuardVacancy',p_limit=>100);
  SELECT value INTO item FROM jsonb_array_elements(page->'items') WHERE (value->>'id')::bigint=-910001;
  IF item IS NULL OR (item->>'relevance')::integer <> (CASE WHEN caller::text LIKE 'a%' THEN 11 ELSE 97 END)
     OR item->>'status' <> (CASE WHEN caller::text LIKE 'a%' THEN 'applied' ELSE 'interviewing' END) THEN
   RAISE EXCEPTION 'Tenant guard: jobs RPC returned another user score/status or lost own data';
  END IF;
  metrics:=public.get_overview_metrics();
  IF page::text LIKE '%' || (CASE WHEN caller::text LIKE 'a%' THEN 'private-marker-b' ELSE 'private-marker-a' END) || '%'
    OR metrics::text LIKE '%' || (CASE WHEN caller::text LIKE 'a%' THEN 'private-marker-b' ELSE 'private-marker-a' END) || '%' THEN
   RAISE EXCEPTION 'Tenant guard: candidate analysis leaked through catalog/overview RPC';
  END IF;
  PERFORM public.save_profile_embedding(('[' || array_to_string(array_fill(0.1::real,ARRAY[384]),',') || ']')::extensions.vector,
    repeat(CASE WHEN caller::text LIKE 'a%' THEN 'a' ELSE 'b' END,64),'all-MiniLM-L6-v2:384:v1');
  IF public.get_profile_embedding_state()->>'content_hash' <> repeat(CASE WHEN caller::text LIKE 'a%' THEN 'a' ELSE 'b' END,64) THEN
   RAISE EXCEPTION 'Tenant guard: own embedding state unavailable';
  END IF;
 END LOOP;
END $$;
-- Neither a confirmed but uninvited user nor an invited but unconfirmed account gets application access.
DO $$ DECLARE caller uuid; t text; n bigint; BEGIN
 FOREACH caller IN ARRAY ARRAY['c3333333-3333-4333-8333-333333333333'::uuid,'d4444444-4444-4444-8444-444444444444'::uuid] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
  IF public.is_authorized_user() THEN RAISE EXCEPTION 'Tenant guard: uninvited/unconfirmed user authorized'; END IF;
  FOR t IN SELECT table_name FROM tenant_contract WHERE access_kind IN ('owner','shared') LOOP
   EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Tenant guard: unauthorized read on %',t; END IF;
  END LOOP;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('avatars','user-documents'))<>0 THEN
   RAISE EXCEPTION 'Tenant guard: unauthorized Storage read';
  END IF;
  BEGIN
   PERFORM public.get_jobs_page();
   RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: unauthorized jobs RPC';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;
  BEGIN
   PERFORM public.get_overview_metrics();
   RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: unauthorized overview RPC';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;
 END LOOP;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $$ DECLARE t text; n bigint; BEGIN
 FOR t IN SELECT table_name FROM tenant_contract LOOP
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
   IF n<>0 THEN RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: anonymous read on ' || t; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id IN ('avatars','user-documents');
  IF n<>0 THEN RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: anonymous Storage read'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.get_jobs_page();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: anonymous jobs RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
