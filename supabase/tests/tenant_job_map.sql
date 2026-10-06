-- Shared pins, owner-scoped filters, service-only geocoding and stale-location guards.
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.jobs SET location='Synthetic Dublin, Ireland' WHERE id IN (-910001,-910002);
SELECT public.apply_job_location_verifications(jsonb_build_array(
 jsonb_build_object('id',-910001,'location','Synthetic Dublin, Ireland','provider','Geoapify',
  'source','https://api.geoapify.com/v1/geocode/search','status','verified','checked_at',now(),
  'latitude',0,'longitude',0,'confidence',1,'precision','city'),
 jsonb_build_object('id',-910002,'location','Synthetic Dublin, Ireland','provider','Geoapify',
  'source','https://api.geoapify.com/v1/geocode/search','status','remote','checked_at',now())
));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$ DECLARE m jsonb; BEGIN
 m:=public.get_job_map(p_search=>'TenantGuardVacancy');
 IF (m->>'total')::integer<>2 OR (m->>'mapped')::integer<>1 OR (m->>'in_view')::integer<>1
  OR (m->'pins'->0->>'latitude')::numeric<>0 OR (m->'pins'->0->>'longitude')::numeric<>0 THEN
  RAISE EXCEPTION 'Map lost full-catalog counts or valid zero coordinates'; END IF;
 IF (public.get_job_map(p_search=>'TenantGuardVacancy',p_min_match=>90)->>'total')::integer<>0
  OR (public.get_job_map(p_search=>'TenantGuardVacancy',p_status=>'interviewing')->>'total')::integer<>0 THEN
  RAISE EXCEPTION 'Map filters read another tenant evaluation/status'; END IF;
 BEGIN PERFORM public.apply_job_location_verifications('[]'); RAISE EXCEPTION 'Browser geocoding write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_job_map(p_bounds=>ARRAY[NULL,0,1,1]::double precision[]); RAISE EXCEPTION 'Null bounds accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
DO $$ BEGIN
 IF (public.get_job_map(p_search=>'TenantGuardVacancy',p_min_match=>90)->>'total')::integer<>1
  OR (public.get_job_map(p_search=>'TenantGuardVacancy',p_status=>'applied')->>'total')::integer<>0 THEN
  RAISE EXCEPTION 'Map did not switch assessment/status ownership'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_job_map(); RAISE EXCEPTION 'Uninvited map access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_job_map(); RAISE EXCEPTION 'Unconfirmed map access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_job_map(); RAISE EXCEPTION 'Anonymous map access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.apply_job_location_verifications(jsonb_build_array(jsonb_build_object('id',-910001,
  'location','Changed input','provider','Geoapify','source','https://api.geoapify.com/v1/geocode/search',
  'status','remote','checked_at',now())));
 IF (r->>'conflicts')::integer<>1 THEN RAISE EXCEPTION 'Changed job input accepted'; END IF;
END $$;
UPDATE public.jobs SET location='A changed location' WHERE id=-910001;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.jobs WHERE id=-910001 AND (location_verification IS NOT NULL OR coordinate_source IS NOT NULL OR latitude IS NOT NULL)) THEN
  RAISE EXCEPTION 'Location edit retained stale geocoding'; END IF;
END $$;
