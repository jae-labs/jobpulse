-- Preserve source text while giving queries an indexable, numeric salary model.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salary_min_amount integer,
  ADD COLUMN IF NOT EXISTS salary_max_amount integer,
  ADD COLUMN IF NOT EXISTS salary_currency text,
  ADD COLUMN IF NOT EXISTS salary_period text;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_salary_amounts_valid
  CHECK (
    (salary_min_amount IS NULL OR salary_min_amount >= 0)
    AND (salary_max_amount IS NULL OR salary_max_amount >= 0)
    AND (salary_min_amount IS NULL OR salary_max_amount IS NULL OR salary_min_amount <= salary_max_amount)
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_jobs_salary_max_amount
  ON public.jobs (salary_max_amount DESC NULLS LAST);

WITH extracted AS (
  SELECT id,
    regexp_match(lower(salary_text), '([0-9]{2,3})\s*k') AS thousands,
    regexp_match(salary_text, '([0-9]{2,3}),([0-9]{3})') AS comma_amount
  FROM public.jobs
  WHERE salary_text IS NOT NULL
)
UPDATE public.jobs job
SET salary_max_amount = coalesce(
      job.salary_max_amount,
      CASE WHEN extracted.thousands IS NOT NULL THEN extracted.thousands[1]::integer * 1000 END,
      CASE WHEN extracted.comma_amount IS NOT NULL THEN (extracted.comma_amount[1] || extracted.comma_amount[2])::integer END
    ),
    salary_min_amount = coalesce(job.salary_min_amount,
      CASE WHEN extracted.thousands IS NOT NULL THEN extracted.thousands[1]::integer * 1000 END,
      CASE WHEN extracted.comma_amount IS NOT NULL THEN (extracted.comma_amount[1] || extracted.comma_amount[2])::integer END
    ),
    salary_currency = coalesce(job.salary_currency, CASE WHEN job.salary_text ~ '€' THEN 'EUR' END),
    salary_period = coalesce(job.salary_period, 'annual')
FROM extracted
WHERE job.id = extracted.id;

COMMENT ON COLUMN public.jobs.salary_text IS 'Original source display text; do not use for numeric filtering or sorting.';
COMMENT ON COLUMN public.jobs.salary_max_amount IS 'Normalized maximum annual salary in salary_currency units.';
