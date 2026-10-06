-- Fixtures and transaction supplied by the tenant runner; no developer data survives.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.jobs SET last_seen_at = now() - interval '20 days', source = 'Archival fixture'
WHERE id IN (-910001, -910002);
INSERT INTO public.sources(name,url,mode,last_status,last_synced_at)
VALUES ('Archival fixture','https://example.invalid/archive','test','Failed',now());
INSERT INTO public.boards(provider,board,company,careers_url,status,last_verified_at)
VALUES ('generic','example.invalid/archive','Archival fixture','https://example.invalid/archive','active',now());
DO $$ BEGIN
  IF public.close_stale_jobs() <> 0 OR EXISTS (
    SELECT 1 FROM public.jobs WHERE id IN (-910001,-910002) AND closed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Source health must not authorize vacancy closure'; END IF;
END $$;
UPDATE public.sources SET last_status = 'Synced' WHERE name = 'Archival fixture';
DO $$ BEGIN
  IF public.close_stale_jobs() <> 0 THEN
    RAISE EXCEPTION 'Even successful source health is not vacancy-specific closure evidence';
  END IF;
END $$;

-- Closing a job hides its live metrics but preserves both tenants' tracking/history.
UPDATE public.jobs SET closed_at = now() WHERE id = -910001;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$ DECLARE m jsonb := public.get_overview_metrics(); BEGIN
  IF (m->>'evaluated')::integer <> 0 OR (m->>'high_fit')::integer <> 0
     OR m->'top_skills' <> '[]'::jsonb OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(m->'relevance_distribution') d WHERE (d->>'count')::integer <> 0
     ) THEN RAISE EXCEPTION 'Closed evaluation leaked into live metrics'; END IF;
  IF (SELECT count(*) FROM public.user_job_evaluations WHERE job_id=-910001) <> 1
     OR (SELECT count(*) FROM public.user_job_statuses WHERE job_id=-910001) <> 1 THEN
    RAISE EXCEPTION 'Owner history lost or foreign history exposed';
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
DO $$ DECLARE m jsonb := public.get_overview_metrics(); BEGIN
  IF (m->>'evaluated')::integer <> 0 OR (m->>'high_fit')::integer <> 0
     OR m->'top_skills' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Foreign tenant closed metrics leaked';
  END IF;
  IF (SELECT count(*) FROM public.user_job_evaluations WHERE job_id=-910001) <> 1 THEN
    RAISE EXCEPTION 'Second owner history lost or foreign history exposed';
  END IF;
  BEGIN
    PERFORM public.close_stale_jobs();
    RAISE EXCEPTION 'Browser can invoke closure RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.refresh_catalog_stats();
    RAISE EXCEPTION 'Browser can refresh backend facets';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.invalidate_catalog_stats();
    RAISE EXCEPTION 'Browser can invalidate backend facets';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.employers(id,name,careers_url,sector,metadata_source)
VALUES (-910010,'Facet fixture','https://example.invalid/facets','Technology','curated');
UPDATE public.jobs SET location = 'Original fixture location', employer_id = -910010 WHERE id=-910002;
SELECT public.refresh_catalog_stats();
UPDATE public.jobs SET location = 'Corrected fixture location' WHERE id=-910002;
DO $$ BEGIN
  IF (SELECT is_valid FROM public.catalog_stats WHERE id) THEN
    RAISE EXCEPTION 'Same-count location update did not invalidate facets';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$ DECLARE m jsonb := public.get_overview_metrics(); BEGIN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m->'locations') l WHERE l->>'loc'='Corrected fixture location')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(m->'locations') l WHERE l->>'loc'='Original fixture location') THEN
    RAISE EXCEPTION 'Overview returned stale location facets';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.refresh_catalog_stats();
UPDATE public.employers SET sector = 'Healthcare' WHERE id=-910010;
DO $$ BEGIN
  IF (SELECT is_valid FROM public.catalog_stats WHERE id) THEN
    RAISE EXCEPTION 'Employer sector update did not invalidate facets';
  END IF;
  IF public.get_overview_metrics()->'sectors' IS DISTINCT FROM (
    SELECT sectors FROM public.catalog_stats WHERE id
  ) THEN RETURN; END IF;
  RAISE EXCEPTION 'Overview reused invalidated sector facets';
END $$;
SELECT public.refresh_catalog_stats();
DO $$ BEGIN
  IF NOT (SELECT is_valid FROM public.catalog_stats WHERE id) THEN
    RAISE EXCEPTION 'Refresh did not restore valid facets';
  END IF;
END $$;

-- Bookmarked New rows and untracked assessed rows remain in New counts/averages.
RESET ROLE;
UPDATE public.jobs SET closed_at = NULL WHERE id=-910001;
UPDATE public.user_job_statuses SET status='new', is_saved=true
WHERE user_id='a1111111-1111-4111-8111-111111111111' AND job_id=-910001;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$ DECLARE m jsonb := public.get_overview_metrics(); BEGIN
  IF (m->'stage_averages'->>'new')::integer <> 11 THEN
    RAISE EXCEPTION 'Assessed New average lost';
  END IF;
  IF (m->'counts'->>'new')::bigint <> (m->>'total')::bigint THEN
    RAISE EXCEPTION 'Saving a New job changed pipeline stage counts';
  END IF;
END $$;
DELETE FROM public.user_job_statuses WHERE job_id=-910001;
DO $$ BEGIN
  IF (public.get_overview_metrics()->'stage_averages'->>'new')::integer <> 11 THEN
    RAISE EXCEPTION 'Untracked assessed New average lost';
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
DO $$ BEGIN
  IF (public.get_overview_metrics()->'stage_averages'->>'new')::integer <> 0 THEN
    RAISE EXCEPTION 'Foreign New evaluation affected second member';
  END IF;
END $$;
