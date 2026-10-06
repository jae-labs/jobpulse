-- New includes untracked jobs and explicit New bookmarks; averages use assessed jobs only.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.get_overview_metrics()'::regprocedure);
  previous text := $old$jsonb_build_object('new', 0)$old$;
BEGIN
  IF strpos(definition, previous) = 0 THEN
    RAISE EXCEPTION 'Unexpected overview stage average contract';
  END IF;
  definition := replace(definition, previous,
    $new$jsonb_build_object('new', (SELECT coalesce(round(avg(ev.relevance)), 0)
      FROM evals ev LEFT JOIN tracked s ON s.job_id = ev.job_id
      WHERE coalesce(s.status, 'new') = 'new' AND ev.relevance IS NOT NULL))$new$);
  definition := replace(definition, '(SELECT count(*) FROM tracked) AS tracked',
    '(SELECT count(*) FROM tracked WHERE status <> ''new'') AS tracked');
  EXECUTE definition;
END $migration$;
