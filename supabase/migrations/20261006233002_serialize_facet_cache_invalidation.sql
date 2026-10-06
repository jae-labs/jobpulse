-- Always acquire the rollup row lock, including when already invalid. Otherwise a
-- writer can skip invalidation while a concurrent refresh is computing old facts,
-- allowing that refresh to publish stale facets as valid after the writer commits.
CREATE OR REPLACE FUNCTION public.invalidate_catalog_stats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.catalog_stats SET is_valid = false WHERE id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_catalog_stats() FROM PUBLIC, anon, authenticated;
