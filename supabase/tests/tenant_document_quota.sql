-- A foreign owner must never reveal another member's document count: the write is
-- rejected with the ownership error before any per-owner quota check runs.
-- Fixtures and transaction are provided by the local runner.

-- Bring tenant A exactly to the 10-CV cap (one fixture CV plus nine more).
INSERT INTO public.user_cvs(user_id,file_name,storage_path)
SELECT 'a1111111-1111-4111-8111-111111111111','quota-'||n,
  'a1111111-1111-4111-8111-111111111111/cv/quota-'||n
FROM generate_series(1,9) n;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
DO $$ DECLARE msg text; BEGIN
 BEGIN
  INSERT INTO public.user_cvs(user_id,file_name,storage_path)
  VALUES ('a1111111-1111-4111-8111-111111111111','probe.pdf','a1111111-1111-4111-8111-111111111111/cv/probe.pdf');
  RAISE EXCEPTION 'Tenant guard: foreign owner write accepted';
 EXCEPTION
  WHEN insufficient_privilege THEN
   GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
   IF msg <> 'Write owner differs from authenticated account' THEN
    RAISE EXCEPTION 'Tenant guard: unexpected ownership error: %', msg;
   END IF;
  WHEN raise_exception THEN
   GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
   RAISE EXCEPTION 'Tenant guard: foreign owner quota oracle leaked: %', msg;
 END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.user_cvs WHERE user_id='a1111111-1111-4111-8111-111111111111')<>10 THEN
  RAISE EXCEPTION 'Tenant guard: foreign owner write changed the tenant rows';
 END IF;
END $$;
