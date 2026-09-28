\set ON_ERROR_STOP on
BEGIN;
-- Reproduce hosted drift without relying on the session's search_path.
DROP INDEX public.idx_jobs_title_trgm;
DROP INDEX public.idx_jobs_company_trgm;
DROP EXTENSION pg_trgm;
SET LOCAL search_path = public;
\ir ../migrations/20260928222416_reconcile_catalog_schema.sql
\ir ../migrations/20260928222947_isolate_search_extension.sql
DO $$ BEGIN
 IF to_regclass('public.idx_jobs_title_trgm') IS NULL OR to_regclass('public.idx_jobs_company_trgm') IS NULL THEN
  RAISE EXCEPTION 'Missing extension recovery did not restore search indexes';
 END IF;
END $$;
ROLLBACK;
