-- Extend the existing authorized overview snapshot with the whole employer registry.
-- Keep the function's ownership, grants, search path and candidate scope unchanged.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.get_overview_metrics()'::regprocedure);
  previous text := $old$'total', (SELECT count(*) FROM combined),$old$;
  replacement text := $new$'total', (SELECT count(*) FROM combined),
    'companies', (SELECT count(*) FROM public.employers),$new$;
BEGIN
  IF strpos(definition, previous) = 0 OR strpos(definition, '''companies''') > 0 THEN
    RAISE EXCEPTION 'Unexpected overview function definition; company count migration aborted';
  END IF;
  EXECUTE replace(definition, previous, replacement);
END
$migration$;
