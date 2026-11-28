-- A member cannot read or destroy another member's Storage object by claiming an
-- orphaned metadata path: object access stays bound to the caller's UID prefix.
-- Fixtures and transaction are provided by the local runner.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
-- Orphan tenant B's document object by removing only its metadata row.
DELETE FROM public.user_cvs WHERE user_id='b2222222-2222-4222-8222-222222222222';
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
-- Tenant A claims B's now-unreferenced object path. The metadata write is allowed;
-- access to the object itself must not be.
INSERT INTO public.user_cvs(user_id,file_name,storage_path)
VALUES ('a1111111-1111-4111-8111-111111111111','claim.pdf','b2222222-2222-4222-8222-222222222222/cv/fixture.pdf');
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='user-documents'
       AND name='b2222222-2222-4222-8222-222222222222/cv/fixture.pdf')<>0 THEN
  RAISE EXCEPTION 'Tenant guard: claimed foreign document is visible';
 END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='user-documents'
       AND name='a1111111-1111-4111-8111-111111111111/cv/fixture.pdf')<>1 THEN
  RAISE EXCEPTION 'Tenant guard: own document became invisible';
 END IF;
END $$;
-- Deletion through the Storage API path (RLS retained) must not touch the foreign object.
SELECT set_config('storage.allow_delete_query','true',true);
DO $$ DECLARE changed bigint; BEGIN
 DELETE FROM storage.objects WHERE bucket_id='user-documents'
   AND name='b2222222-2222-4222-8222-222222222222/cv/fixture.pdf';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Tenant guard: foreign document deleted after claim'; END IF;
END $$;
RESET ROLE;
-- The foreign object still exists for its owner and administrators.
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='user-documents'
       AND name='b2222222-2222-4222-8222-222222222222/cv/fixture.pdf')<>1 THEN
  RAISE EXCEPTION 'Tenant guard: foreign document unexpectedly removed';
 END IF;
END $$;
