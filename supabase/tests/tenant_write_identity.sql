-- A payload created for A must never be reassigned to B by an ownership trigger.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
DO $$
DECLARE snapshot jsonb; vec extensions.vector := ('[1,' || repeat('0,',382) || '0]')::extensions.vector;
BEGIN
  BEGIN
    INSERT INTO public.user_profiles(user_id,headline)
    VALUES('a1111111-1111-4111-8111-111111111111','Stale account A form')
    ON CONFLICT(user_id) DO UPDATE SET headline=EXCLUDED.headline;
    RAISE EXCEPTION 'Stale profile payload was accepted by account B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.user_job_statuses(user_id,job_id,status)
    VALUES('a1111111-1111-4111-8111-111111111111',-910002,'rejected');
    RAISE EXCEPTION 'Stale status payload was accepted by account B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.user_profiles WHERE headline='Stale account A form')
    OR EXISTS(SELECT 1 FROM public.user_job_statuses WHERE job_id=-910002) THEN
    RAISE EXCEPTION 'Account B was modified by stale account A data';
  END IF;
  UPDATE public.user_profiles SET headline='Current account B form'
    WHERE user_id='b2222222-2222-4222-8222-222222222222';
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE headline='Current account B form') THEN
    RAISE EXCEPTION 'Correctly bound profile write was denied';
  END IF;
  SELECT jsonb_build_object('headline',coalesce(p.headline,''),'current_role',coalesce(p.current_role,''),
    'summary',coalesce(p.summary,''),'keywords',coalesce(to_jsonb(p.keywords),'[]'::jsonb),
    'tools_software',coalesce(to_jsonb(p.tools_software),'[]'::jsonb),'languages',coalesce(to_jsonb(p.languages),'[]'::jsonb),
    'certifications',coalesce(p.certifications,''),'education',coalesce(p.education,''))
  INTO snapshot FROM public.user_profiles p;
  BEGIN
    PERFORM public.save_profile_embedding_guarded('a1111111-1111-4111-8111-111111111111',snapshot,vec,repeat('a',64),'all-MiniLM-L6-v2:384:v1');
    RAISE EXCEPTION 'Foreign inference owner was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_profile_embedding_guarded('b2222222-2222-4222-8222-222222222222',snapshot || '{"headline":"Stale"}',vec,repeat('a',64),'all-MiniLM-L6-v2:384:v1');
    RAISE EXCEPTION 'Stale inference snapshot was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.save_profile_embedding_guarded('b2222222-2222-4222-8222-222222222222',snapshot,vec,repeat('a',64),'all-MiniLM-L6-v2:384:v1');
  IF public.get_profile_embedding_state()->>'content_hash' <> repeat('a',64) THEN
    RAISE EXCEPTION 'Current owner inference write was denied';
  END IF;
END $$;
