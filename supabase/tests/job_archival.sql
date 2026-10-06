-- @tenant-fixtures
-- A soft-closed posting is hidden from list, map and overview but retained, and the
-- overview pipeline still reconciles to the open total.
\set ON_ERROR_STOP on

BEGIN;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE target bigint;
BEGIN
  SELECT id INTO target FROM public.jobs WHERE closed_at IS NULL ORDER BY id LIMIT 1;
  IF target IS NULL THEN
    RAISE EXCEPTION 'No open job fixture to close';
  END IF;
  UPDATE public.jobs SET closed_at = now(), closed_reason = 'unseen' WHERE id = target;
  PERFORM set_config('test.closed_job', target::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","email":"tenant-a@example.invalid"}', true);
DO $$
DECLARE
  open_total bigint;
  page_total bigint;
  map_total bigint;
  metrics jsonb;
  pipeline bigint;
  retained bigint;
  target bigint := current_setting('test.closed_job')::bigint;
BEGIN
  SELECT count(*) INTO open_total FROM public.jobs WHERE closed_at IS NULL;
  page_total := (public.get_jobs_page(p_limit => 1, p_offset => 0)->>'total')::bigint;
  map_total := (public.get_job_map()->>'total')::bigint;
  metrics := public.get_overview_metrics();
  SELECT COALESCE(sum(value::integer), 0) INTO pipeline
  FROM jsonb_each_text(metrics->'counts')
  WHERE key IN ('new','applied','interviewing','rejected','not_interested');
  SELECT count(*) INTO retained FROM public.jobs WHERE id = target;

  IF page_total <> open_total OR map_total <> open_total THEN
    RAISE EXCEPTION 'Closed job still listed: open %, page %, map %', open_total, page_total, map_total;
  END IF;
  IF (metrics->>'total')::bigint <> open_total THEN
    RAISE EXCEPTION 'Overview total % <> open %', metrics->>'total', open_total;
  END IF;
  IF pipeline <> open_total THEN
    RAISE EXCEPTION 'Overview pipeline % <> open %', pipeline, open_total;
  END IF;
  IF retained <> 1 THEN
    RAISE EXCEPTION 'Soft-closed job was not retained';
  END IF;
END $$;
ROLLBACK;
