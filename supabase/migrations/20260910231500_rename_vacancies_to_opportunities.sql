-- Align source and employer telemetry with the product term “opportunities”.
-- The conditional guards make this safe for both existing deployments and a
-- fresh database created from the updated baseline migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = 'vacancies_found'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources' AND column_name = 'opportunities_found'
  ) THEN
    ALTER TABLE public.sources RENAME COLUMN vacancies_found TO opportunities_found;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employers' AND column_name = 'vacancies_found'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employers' AND column_name = 'opportunities_found'
  ) THEN
    ALTER TABLE public.employers RENAME COLUMN vacancies_found TO opportunities_found;
  END IF;
END $$;
