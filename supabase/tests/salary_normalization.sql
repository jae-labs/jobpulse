\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.jobs (id, dedupe_key, title, company, description, url, source, salary_text)
VALUES (999020, 'salary-refresh-test', 'Engineer', 'Example', '', 'https://example.com/salary', 'test', '€55.5–70k annual');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = 999020 AND salary_min_amount = 55500
    AND salary_max_amount = 70000 AND salary_currency = 'EUR' AND salary_period = 'annual') THEN
    RAISE EXCEPTION 'Decimal and abbreviated salary range parsed incorrectly';
  END IF;
END;
$$;
UPDATE public.jobs SET salary_text = '$90,000 monthly' WHERE id = 999020;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = 999020 AND salary_min_amount = 90000
    AND salary_max_amount = 90000 AND salary_currency = 'USD' AND salary_period = 'monthly') THEN
    RAISE EXCEPTION 'Derived salary facts were stale after raw pay changed';
  END IF;
END;
$$;
UPDATE public.jobs SET salary_text = NULL WHERE id = 999020;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = 999020 AND (salary_min_amount IS NOT NULL
    OR salary_max_amount IS NOT NULL OR salary_currency IS NOT NULL OR salary_period IS NOT NULL)) THEN
    RAISE EXCEPTION 'Derived salary facts survived removal of advertised pay';
  END IF;
END;
$$;
UPDATE public.jobs SET salary_text = '€60k per week' WHERE id = 999020;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id=999020 AND salary_period='weekly') THEN
    RAISE EXCEPTION 'Weekly pay was misclassified as annual';
  END IF;
END $$;
UPDATE public.jobs SET salary_text = '€60k plus holiday allowance' WHERE id = 999020;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id=999020 AND salary_period='annual') THEN
    RAISE EXCEPTION 'Holiday allowance was misclassified as daily pay';
  END IF;
END $$;
ROLLBACK;
