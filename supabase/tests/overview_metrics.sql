-- Run after applying migrations to a database with the local development seed.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);

DO $$
DECLARE
  metrics jsonb := public.get_overview_metrics();
  total_jobs integer;
  category_jobs integer;
  pipeline_jobs integer;
  relevance_jobs integer;
BEGIN
  IF NOT (metrics ?& ARRAY['total', 'high_fit', 'counts', 'stage_averages', 'categories', 'relevance_distribution', 'top_skills']) THEN
    RAISE EXCEPTION 'Overview metrics response is missing chart fields';
  END IF;

  total_jobs := (metrics->>'total')::integer;
  SELECT COALESCE(sum(value::integer), 0) INTO pipeline_jobs
  FROM jsonb_each_text(metrics->'counts');
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(metrics->'counts') AS stage(status, count)
    WHERE NOT (metrics->'stage_averages' ? stage.status)
      OR (metrics->'stage_averages'->>stage.status)::integer NOT BETWEEN 0 AND 100
  ) THEN
    RAISE EXCEPTION 'Pipeline stages are missing valid average match scores';
  END IF;
  SELECT COALESCE(sum((category->>'value')::integer), 0) INTO category_jobs
  FROM jsonb_array_elements(metrics->'categories') AS category;
  SELECT COALESCE(sum((tier->>'count')::integer), 0) INTO relevance_jobs
  FROM jsonb_array_elements(metrics->'relevance_distribution') AS tier;

  IF total_jobs = 0 OR pipeline_jobs <> total_jobs OR category_jobs <> total_jobs OR relevance_jobs <> total_jobs THEN
    RAISE EXCEPTION 'Overview chart counts do not reconcile: total %, pipeline %, categories %, relevance %',
      total_jobs, pipeline_jobs, category_jobs, relevance_jobs;
  END IF;
END;
$$;
ROLLBACK;
