-- Old callers must not retire an untracked vacancy merely because it is old.
-- The local runner supplies the tenant contract/fixtures and a rollback transaction.
RESET ROLE;
INSERT INTO public.jobs(id,dedupe_key,title,company,location,description,url,source,last_seen_at)
VALUES(-960001,'synthetic-retained-vacancy','Synthetic retained vacancy','Synthetic employer',
 'Test City','Synthetic vacancy facts','https://example.invalid/retained','test',now()-interval '400 days');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE days integer;
BEGIN
 FOREACH days IN ARRAY ARRAY[1,3,365] LOOP
  IF public.prune_stale_catalog_jobs(days)<>0 THEN
   RAISE EXCEPTION 'Retired pruning API reported a deletion';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=-960001) THEN
   RAISE EXCEPTION 'Age-only pruning deleted a vacancy without closure evidence';
  END IF;
 END LOOP;
END $$;
