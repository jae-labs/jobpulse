SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","email":"tenant-a@example.invalid"}',true);
DO $$ DECLARE leaked bigint; BEGIN
 SELECT count(*) INTO leaked FROM public.authorized_users
 WHERE user_id='b2222222-2222-4222-8222-222222222222'
    OR invited_by='b2222222-2222-4222-8222-222222222222';
 IF leaked<>0 THEN RAISE EXCEPTION 'Tenant guard: member can read another member authorization/invitation'; END IF;
 IF (SELECT count(*) FROM public.authorized_users WHERE email='pending-a@example.invalid')<>1 THEN
   RAISE EXCEPTION 'Tenant guard: own pending invitation is inaccessible';
 END IF;
END $$;
RESET ROLE;
SELECT set_config('tenant_guard.foreign_invitation',(SELECT id::text FROM public.authorized_users WHERE email='pending-b@example.invalid'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.delete_invitation(current_setting('tenant_guard.foreign_invitation')::bigint);
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: deleted foreign invitation';
 EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;
 BEGIN
  PERFORM public.create_invitation('pending-b@example.invalid');
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tenant guard: retrieved foreign invitation code via RPC';
 EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;
END $$;
