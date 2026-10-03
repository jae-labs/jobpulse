-- Public company facts contain no candidate scores; only backend workers can write.
INSERT INTO public.employers(id,name,sector,careers_url) VALUES(-989001,'Synthetic Office Ltd','Uncategorized','https://example.invalid');
UPDATE public.jobs SET employer_id=-989001,location='Synthetic City' WHERE id IN (-910001,-910002);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE r jsonb; BEGIN
 r:='{"employer_id":-989001,"name":"Synthetic Office Ltd","location":"Synthetic City","status":"found","offices":[{"place_id":"synthetic-office","name":"Synthetic Office Ltd","address":"1 Synthetic Street","latitude":0,"longitude":0,"categories":["office.it"]}]}';
 IF NOT public.save_employer_office_lookup(r) THEN RAISE EXCEPTION 'Office save failed'; END IF;
 IF NOT public.save_employer_office_lookup(r) THEN RAISE EXCEPTION 'Office idempotence failed'; END IF;
 IF (SELECT count(*) FROM public.employer_offices WHERE employer_id=-989001)<>1 THEN RAISE EXCEPTION 'Duplicate offices'; END IF;
 IF public.pending_employer_office_lookups(100) @> '[{"employer_id":-989001,"location":"Synthetic City"}]' THEN RAISE EXCEPTION 'Fresh company looked up again'; END IF;
 IF public.save_employer_office_lookup(jsonb_set(r,'{name}','"Stale Name"')) THEN RAISE EXCEPTION 'Stale identity saved'; END IF;
 PERFORM public.save_employer_office_lookup(jsonb_set(jsonb_set(r,'{offices}','[]'),'{status}','"unresolved"'));
 IF (SELECT count(*) FROM public.employer_offices WHERE employer_id=-989001)<>1 THEN RAISE EXCEPTION 'Failure erased office'; END IF;
 BEGIN PERFORM public.save_employer_office_lookup(jsonb_set(r,'{offices,0,latitude}','91')); RAISE EXCEPTION 'Bad coordinate accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.jobs SET coordinate_source='geocoded',latitude=53,longitude=-6,
 location_verification='{"location":"Synthetic City","status":"verified","precision":"city"}' WHERE id IN (-910001,-910002);
UPDATE public.employer_office_lookups SET status='found',office_place_ids='["synthetic-office"]' WHERE employer_id=-989001;
CREATE FUNCTION pg_temp.assert_office_access(allowed boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.employer_offices WHERE employer_id=-989001;
 IF (n=1) IS DISTINCT FROM allowed THEN RAISE EXCEPTION 'Office visibility incorrect'; END IF;
 BEGIN INSERT INTO public.employer_offices(employer_id,place_id,name,address,latitude,longitude) VALUES(-989001,'forged','Forged','Synthetic',0,0);
  RAISE EXCEPTION 'Browser office insert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.employer_offices SET address='Forged' WHERE employer_id=-989001;
  RAISE EXCEPTION 'Browser office update'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.employer_offices WHERE employer_id=-989001;
  RAISE EXCEPTION 'Browser office delete'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pending_employer_office_lookups(1); RAISE EXCEPTION 'Browser research access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_employer_office_lookup('{"employer_id":-989001}'); RAISE EXCEPTION 'Browser worker write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.employer_office_lookups; RAISE EXCEPTION 'Browser queue read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
CREATE FUNCTION pg_temp.assert_office_map(expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 result:=public.get_job_map(p_search=>'TenantGuardVacancy',p_min_match=>80);
 IF jsonb_array_length(result->'office_pins')<>expected THEN RAISE EXCEPTION 'Office layer leaked foreign scores or lost own filters'; END IF;
 IF expected=1 AND (result->'office_pins'->0->>'precision'<>'company_office'
   OR (result->'office_pins'->0->>'latitude')::float8<>0
   OR (result->'pins'->0->>'latitude')::float8<>53) THEN RAISE EXCEPTION 'Office layer replaced posting evidence'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
SELECT pg_temp.assert_office_access(true);
SELECT pg_temp.assert_office_map(0);
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
SELECT pg_temp.assert_office_access(true);
SELECT pg_temp.assert_office_map(1);
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","user_metadata":{"authorized":true}}',true);
SELECT pg_temp.assert_office_access(false);
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
SELECT pg_temp.assert_office_access(false);
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.employer_offices; RAISE EXCEPTION 'Anonymous office access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pending_employer_office_lookups(1); RAISE EXCEPTION 'Anonymous research access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
UPDATE public.employer_offices SET checked_at=now()-interval '181 days' WHERE employer_id=-989001;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
SELECT pg_temp.assert_office_map(0);
RESET ROLE;
UPDATE public.employer_offices SET checked_at=now() WHERE employer_id=-989001;
INSERT INTO public.employer_offices(employer_id,place_id,name,address,latitude,longitude)
 VALUES(-989001,'second-office','Synthetic Office Ltd','2 Synthetic Street',1,1);
UPDATE public.employer_office_lookups SET office_place_ids='["synthetic-office","second-office"]' WHERE employer_id=-989001;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_office_map(0);
