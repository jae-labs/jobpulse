\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE role_name text;
DECLARE fn text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH fn IN ARRAY ARRAY['set_user_id_from_auth', 'check_user_cv_limit', 'check_user_cover_letter_limit'] LOOP
      IF has_function_privilege(role_name, 'public.' || fn || '()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Internal trigger % is callable by %', fn, role_name;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Scraper service role requires BYPASSRLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='pg_trgm' AND n.nspname <> 'extensions') THEN
    RAISE EXCEPTION 'Search extension is exposed in the API schema';
  END IF;
  IF to_regclass('public.idx_jobs_title_trgm') IS NULL OR to_regclass('public.idx_jobs_company_trgm') IS NULL
    OR to_regclass('public.idx_jobs_last_seen_at') IS NULL
    OR to_regclass('public.idx_user_job_evaluations_user_relevance') IS NULL THEN
    RAISE EXCEPTION 'Required search or candidate-ranking index is absent';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('jobs', 'sources', 'employers', 'user_profiles', 'user_job_statuses')
    AND c.relreplident <> 'd') THEN
    RAISE EXCEPTION 'Previous-row replication unexpectedly enabled';
  END IF;
END;
$$;
ROLLBACK;
