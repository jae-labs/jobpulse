-- Salary amounts are derived from salary_text by the canonical trigger.
-- Rebuild old parser output and clear stale amounts when no pay is advertised.
UPDATE public.jobs
SET salary_min_amount = NULL,
    salary_max_amount = NULL,
    salary_currency = NULL,
    salary_period = NULL
WHERE NULLIF(btrim(salary_text), '') IS NOT NULL
   OR salary_min_amount IS NOT NULL
   OR salary_max_amount IS NOT NULL
   OR salary_currency IS NOT NULL
   OR salary_period IS NOT NULL;

COMMENT ON COLUMN public.jobs.salary_min_amount IS 'Minimum advertised amount in salary_currency per salary_period; not necessarily annual.';
COMMENT ON COLUMN public.jobs.salary_max_amount IS 'Maximum advertised amount in salary_currency per salary_period; not necessarily annual.';
