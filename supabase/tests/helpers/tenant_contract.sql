-- Loaded inside a rollback-only transaction by scripts/test-database.mjs.
-- Every public relation needs a deliberate classification. No implicit shared data.
CREATE TEMP TABLE tenant_contract (table_name text PRIMARY KEY, access_kind text NOT NULL);
INSERT INTO tenant_contract VALUES
  ('authorized_users', 'invitations'),
  ('jobs', 'shared'), ('sources', 'shared'), ('employers', 'shared'),
  ('employer_offices', 'shared'), ('employer_office_lookups', 'backend'),
  ('user_profiles', 'owner'), ('user_job_statuses', 'owner'),
  ('user_job_evaluations', 'owner'), ('user_cvs', 'owner'), ('user_cover_letters', 'owner'),
  ('scoring_catalog_generation', 'backend'), ('candidate_scoring_work', 'backend'),
  ('job_scoring_embeddings', 'backend'), ('profile_scoring_embeddings', 'backend');
GRANT SELECT ON tenant_contract TO authenticated, anon;

CREATE TEMP TABLE browser_rpc_contract (signature text PRIMARY KEY);
INSERT INTO browser_rpc_contract VALUES
  ('public.create_invitation(text)'), ('public.delete_invitation(bigint)'),
  ('public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer,text)'),
  ('public.get_job_map(text,text,integer,text,text,text,double precision[],integer)'),
  ('public.get_overview_metrics()'), ('public.set_job_saved(bigint,boolean)'), ('public.is_authorized_user()'),
  ('public.jobpulse_literal_search_pattern(text)'), ('public.owns_document_object(text)'),
  ('public.get_profile_embedding_state()'),
  ('public.save_profile_embedding(extensions.vector,text,text)'),
  ('public.save_profile_embedding_guarded(uuid,jsonb,extensions.vector,text,text)'),
  ('public.rescore_user(uuid,integer)'), ('public.score_from_subscores(jsonb,jsonb)'),
  ('public.fit_tier_for_score(integer)'), ('public.normalize_job_salary()');

CREATE FUNCTION pg_temp.assert_tenant_catalog() RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; role_name text;
BEGIN
  FOR r IN
    SELECT c.*, t.access_kind FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN tenant_contract t ON t.table_name=c.relname
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    IF r.access_kind IS NULL THEN
      RAISE EXCEPTION 'Tenant guard: unclassified public relation %', r.relname;
    END IF;
    IF r.relkind NOT IN ('r','p') OR NOT r.relrowsecurity THEN
      RAISE EXCEPTION 'Tenant guard: % must be a table with RLS enabled', r.relname;
    END IF;
    IF r.access_kind='owner' AND NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid=r.oid AND attname='user_id'
        AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Tenant guard: % needs a non-null UUID owner', r.relname;
    END IF;
    IF r.access_kind='backend' THEN
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_table_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,DELETE') THEN
          RAISE EXCEPTION 'Tenant guard: backend table % is reachable by %', r.relname,role_name;
        END IF;
      END LOOP;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(role_name,r.oid,'TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Tenant guard: maintenance privileges on % granted to %',r.relname,role_name;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM tenant_contract WHERE to_regclass('public.' || table_name) IS NULL) THEN
    RAISE EXCEPTION 'Tenant guard: classified table is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM browser_rpc_contract WHERE to_regprocedure(signature) IS NULL) THEN
    RAISE EXCEPTION 'Tenant guard: classified browser function is missing';
  END IF;
  FOR r IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' LOOP
    IF has_function_privilege('authenticated',r.oid,'EXECUTE') AND NOT EXISTS (
      SELECT 1 FROM browser_rpc_contract WHERE to_regprocedure(signature)=r.oid
    ) THEN
      RAISE EXCEPTION 'Tenant guard: unclassified browser function %', r.oid::regprocedure;
    END IF;
    -- Legacy salary normalizer is a trigger, not an invocable data API function.
    IF has_function_privilege('anon',r.oid,'EXECUTE') AND
      NOT (r.oid='public.normalize_job_salary()'::regprocedure AND r.prorettype='trigger'::regtype AND NOT r.prosecdef) THEN
      RAISE EXCEPTION 'Tenant guard: anonymous function execution %', r.oid::regprocedure;
    END IF;
    IF r.prosecdef AND NOT EXISTS (
      SELECT 1 FROM unnest(r.proconfig) setting WHERE setting LIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION 'Tenant guard: privileged function % has no fixed search_path', r.oid::regprocedure;
    END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_schema_privilege(role_name,'public','CREATE') THEN
      RAISE EXCEPTION 'Tenant guard: % can create objects in public',role_name;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Tenant guard: storage.objects RLS is disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id NOT IN ('avatars','user-documents') OR public)
    OR (SELECT count(*) FROM storage.buckets WHERE id IN ('avatars','user-documents')) <> 2 THEN
    RAISE EXCEPTION 'Tenant guard: missing, public, or unclassified storage bucket';
  END IF;
END $$;

CREATE FUNCTION pg_temp.assert_private_visibility(caller uuid, other_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text; own_rows bigint; foreign_rows bigint;
BEGIN
  FOR t IN SELECT table_name FROM tenant_contract WHERE access_kind='owner' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',t) INTO own_rows USING caller;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',t) INTO foreign_rows USING other_user;
    IF own_rows=0 OR foreign_rows<>0 THEN
      RAISE EXCEPTION 'Tenant guard: % owner visibility failed (own %, foreign %)',t,own_rows,foreign_rows;
    END IF;
  END LOOP;
END $$;

-- Unfiltered writes matter: a WHERE/RETURNING clause can invoke SELECT RLS and
-- conceal an overly broad UPDATE/DELETE policy. Always roll these probes back.
CREATE FUNCTION pg_temp.assert_private_writes(caller uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text; own_rows bigint; changed bigint;
BEGIN
 FOR t IN SELECT table_name FROM tenant_contract WHERE access_kind='owner' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO own_rows;
  BEGIN
   EXECUTE format('UPDATE public.%I SET user_id=$1',t) USING caller;
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed<>own_rows THEN RAISE EXCEPTION 'Tenant guard: unfiltered UPDATE crossed ownership on %',t; END IF;
   RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='Rollback successful write probe';
  EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL; END;
  BEGIN
   EXECUTE format('DELETE FROM public.%I',t);
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed<>own_rows THEN RAISE EXCEPTION 'Tenant guard: unfiltered DELETE crossed ownership on %',t; END IF;
   RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='Rollback successful write probe';
  EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL; END;
 END LOOP;
END $$;
