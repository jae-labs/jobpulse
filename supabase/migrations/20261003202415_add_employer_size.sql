ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS size text CHECK (size IN ('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+')),
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

COMMENT ON COLUMN public.employers.size IS 'Headcount bracket of the company derived from enrichment or verified evidence.';
COMMENT ON COLUMN public.employers.enriched_at IS 'Timestamp of the latest metadata and office enrichment run.';
