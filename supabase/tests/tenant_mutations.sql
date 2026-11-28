-- Prove the guard itself rejects realistic regressions. Each caught failure rolls its mutation back.
DO $$ BEGIN
 BEGIN
  GRANT TRUNCATE ON public.user_profiles TO authenticated;
  PERFORM pg_temp.assert_tenant_catalog();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed browser TRUNCATE privilege';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  CREATE TABLE public.unguarded_feature(id bigint);
  PERFORM pg_temp.assert_tenant_catalog();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed an unclassified table';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
  PERFORM pg_temp.assert_tenant_catalog();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed disabled RLS';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  GRANT EXECUTE ON FUNCTION public.score_job_for_user(uuid,bigint,real) TO authenticated;
  PERFORM pg_temp.assert_tenant_catalog();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed privileged RPC exposure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  GRANT EXECUTE ON FUNCTION public.get_overview_metrics() TO anon;
  PERFORM pg_temp.assert_tenant_catalog();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed anonymous RPC exposure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE storage.buckets SET public=true WHERE id='user-documents';
  PERFORM pg_temp.assert_tenant_catalog();
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed a public private bucket';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  CREATE POLICY tenant_guard_bad_delete ON public.user_cvs FOR DELETE TO authenticated USING(true);
  PERFORM set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_private_writes('a1111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed an unfiltered cross-user delete';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
 BEGIN
  CREATE POLICY tenant_guard_bad_policy ON public.user_profiles FOR SELECT TO authenticated USING(true);
  PERFORM set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_private_visibility('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222');
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Guard missed a permissive policy';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Tenant guard:%' THEN RAISE; END IF;
 END;
END $$;
SELECT pg_temp.assert_tenant_catalog();
