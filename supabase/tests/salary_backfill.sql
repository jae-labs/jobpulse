\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.jobs (id, dedupe_key, title, company, description, url, source,
  salary_text, salary_min_amount, salary_max_amount, salary_currency, salary_period)
VALUES
  (999041, 'salary-legacy-missing', 'Engineer', 'Example', '', 'https://example.com/legacy', 'test',
    NULL, 55000, 55000, 'EUR', 'annual'),
  (999042, 'salary-legacy-wrong', 'Engineer', 'Example', '', 'https://example.com/wrong', 'test',
    '€75k annual', 55000, 55000, 'EUR', 'annual');
\ir ../migrations/20260928222613_rebuild_advertised_salary_facts.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = 999041 AND (salary_min_amount IS NOT NULL
    OR salary_max_amount IS NOT NULL OR salary_currency IS NOT NULL OR salary_period IS NOT NULL)) THEN
    RAISE EXCEPTION 'Unadvertised historical amounts survived the backfill';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = 999042 AND salary_min_amount = 75000
    AND salary_max_amount = 75000 AND salary_currency = 'EUR' AND salary_period = 'annual') THEN
    RAISE EXCEPTION 'Historical derived amount was not refreshed';
  END IF;
END;
$$;
ROLLBACK;
