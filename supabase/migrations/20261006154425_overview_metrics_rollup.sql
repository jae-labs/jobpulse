-- Forward migration: precompute shared overview facets so the per-user metrics no
-- longer scan the whole catalogue.
--
-- `get_overview_metrics` used to build one row per job (joining employers, the
-- caller's evaluations and statuses) to compute counts, facets and distributions,
-- so its cost grew with the catalogue even though the page shows 40 rows. Shared
-- facets (total, locations, employer sectors) now live in a one-row rollup refreshed
-- by the scraper; per-user metrics are derived from the caller's evaluations and
-- statuses only. Totals reconcile exactly: new = total - tracked, and the
-- Uncategorized bucket absorbs unevaluated jobs.

CREATE TABLE public.catalog_stats (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  job_count bigint NOT NULL DEFAULT 0 CHECK (job_count >= 0),
  locations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(locations) = 'array'),
  sectors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sectors) = 'array'),
  computed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_stats IS 'Shared catalogue facets (job count, locations, employer sectors) for get_overview_metrics; refreshed by the scraper.';
ALTER TABLE public.catalog_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalog_stats TO service_role;
INSERT INTO public.catalog_stats (id) VALUES (true);

CREATE FUNCTION public.refresh_catalog_stats() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  UPDATE public.catalog_stats SET
    job_count = (SELECT count(*) FROM public.jobs),
    locations = (
      SELECT coalesce(jsonb_agg(jsonb_build_object('loc', location, 'count', cnt) ORDER BY cnt DESC, location), '[]'::jsonb)
      FROM (
        SELECT location, count(*) AS cnt FROM public.jobs
        WHERE trim(coalesce(location, '')) <> ''
        GROUP BY location ORDER BY cnt DESC, location LIMIT 200
      ) l
    ),
    sectors = (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', sector, 'value', cnt, 'avgMatch', 0)
        ORDER BY CASE sector WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, cnt DESC, sector), '[]'::jsonb)
      FROM (
        SELECT coalesce(cs.sector, 'Uncategorized') AS sector, count(*) AS cnt
        FROM public.jobs j
        LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id
        GROUP BY 1
      ) s
    ),
    computed_at = now()
  WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.refresh_catalog_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_stats() TO service_role;

CREATE OR REPLACE FUNCTION "public"."get_overview_metrics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_caller_role text := auth.role();
  v_effective_uid uuid;
  v_total bigint;
  v_stats_count bigint;
  v_locations jsonb;
  v_sectors jsonb;
  result jsonb;
BEGIN
  IF v_caller_role = 'service_role' THEN
    v_effective_uid := auth.uid();
  ELSE
    IF NOT public.is_authorized_user() THEN
      RAISE EXCEPTION 'Access denied: user is not authorized';
    END IF;
    v_effective_uid := auth.uid();
  END IF;

  SELECT count(*) INTO v_total FROM public.jobs;
  SELECT job_count, locations, sectors INTO v_stats_count, v_locations, v_sectors
    FROM public.catalog_stats WHERE id;
  -- Correctness fallback: an unrefreshed rollup must not change the reported facets.
  IF v_stats_count IS DISTINCT FROM v_total OR v_locations IS NULL OR v_sectors IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('loc', location, 'count', cnt) ORDER BY cnt DESC, location), '[]'::jsonb)
      INTO v_locations
      FROM (SELECT location, count(*) AS cnt FROM public.jobs WHERE trim(coalesce(location, '')) <> ''
            GROUP BY location ORDER BY cnt DESC, location LIMIT 200) l;
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', sector, 'value', cnt, 'avgMatch', 0)
        ORDER BY CASE sector WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, cnt DESC, sector), '[]'::jsonb)
      INTO v_sectors
      FROM (SELECT coalesce(cs.sector, 'Uncategorized') AS sector, count(*) AS cnt
            FROM public.jobs j
            LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id
            GROUP BY 1) s;
  END IF;

  WITH evals AS (
    SELECT e.job_id,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights')
      ELSE e.relevance END AS relevance,
      coalesce(nullif(trim(e.ai_analysis->>'role_domain'), ''), 'Uncategorized') AS role_domain,
      CASE WHEN jsonb_typeof(e.matched_skills) = 'array' THEN e.matched_skills ELSE '[]'::jsonb END AS matched_skills
    FROM public.user_job_evaluations e
    JOIN public.user_profiles p ON p.user_id = e.user_id
    WHERE v_effective_uid IS NOT NULL AND e.user_id = v_effective_uid
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM evals) AS eval_count,
      (SELECT count(*) FROM evals WHERE relevance IS NOT NULL) AS evaluated,
      (SELECT count(*) FROM public.user_job_statuses WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid) AS tracked
  ),
  status_counts AS (
    SELECT s.status, count(*) AS cnt, coalesce(round(avg(ev.relevance)), 0) AS avg_match
    FROM public.user_job_statuses s
    LEFT JOIN evals ev ON ev.job_id = s.job_id
    WHERE v_effective_uid IS NOT NULL AND s.user_id = v_effective_uid
    GROUP BY s.status
  ),
  saved_stats AS (
    SELECT count(*) FILTER (WHERE s.is_saved) AS saved,
           coalesce(round(avg(ev.relevance) FILTER (WHERE s.is_saved AND ev.relevance IS NOT NULL)), 0) AS saved_avg
    FROM public.user_job_statuses s
    LEFT JOIN evals ev ON ev.job_id = s.job_id
    WHERE v_effective_uid IS NOT NULL AND s.user_id = v_effective_uid
  ),
  skill_counts AS (
    SELECT skill.value AS skill, count(*) AS cnt
    FROM evals c
    CROSS JOIN LATERAL jsonb_array_elements_text(c.matched_skills) AS skill(value)
    WHERE trim(skill.value) <> ''
    GROUP BY skill.value ORDER BY cnt DESC, skill.value LIMIT 10
  ),
  sector_avgs AS (
    SELECT coalesce(cs.sector, 'Uncategorized') AS employer_sector,
      coalesce(round(avg(ev.relevance)), 0) AS avg_match
    FROM evals ev
    JOIN public.jobs j ON j.id = ev.job_id
    LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id
    WHERE ev.relevance IS NOT NULL
    GROUP BY 1
  ),
  sectors_full AS (
    SELECT s.value->>'name' AS name, (s.value->>'value')::integer AS value, coalesce(sa.avg_match, 0) AS avg_match
    FROM jsonb_array_elements(v_sectors) AS s(value)
    LEFT JOIN sector_avgs sa ON sa.employer_sector = s.value->>'name'
  )
  SELECT jsonb_build_object(
    'total', v_total,
    'companies', (SELECT count(*) FROM public.employers),
    'evaluated', (SELECT evaluated FROM totals),
    'locations', v_locations,
    'high_fit', (SELECT count(*) FROM evals WHERE relevance >= 75),
    'counts', (SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) FROM status_counts)
      || jsonb_build_object('new', v_total - (SELECT tracked FROM totals))
      || jsonb_build_object('saved', (SELECT saved FROM saved_stats), 'interested', (SELECT saved FROM saved_stats)),
    'stage_averages', (SELECT coalesce(jsonb_object_agg(status, avg_match), '{}'::jsonb) FROM status_counts)
      || jsonb_build_object('new', 0)
      || jsonb_build_object('saved', (SELECT saved_avg FROM saved_stats)),
    'categories', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'avgMatch', avg_match)
      ORDER BY CASE name WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, value DESC, name), '[]'::jsonb) FROM sectors_full),
    'sectors', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'avgMatch', avg_match)
      ORDER BY CASE name WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, value DESC, name), '[]'::jsonb) FROM sectors_full),
    'relevance_distribution', (SELECT jsonb_build_array(
      jsonb_build_object('range', '90-100%', 'min', 90, 'max', 100, 'count', count(*) FILTER (WHERE relevance >= 90 AND relevance <= 100)),
      jsonb_build_object('range', '80-89%', 'min', 80, 'max', 89, 'count', count(*) FILTER (WHERE relevance >= 80 AND relevance < 90)),
      jsonb_build_object('range', '70-79%', 'min', 70, 'max', 79, 'count', count(*) FILTER (WHERE relevance >= 70 AND relevance < 80)),
      jsonb_build_object('range', '60-69%', 'min', 60, 'max', 69, 'count', count(*) FILTER (WHERE relevance >= 60 AND relevance < 70)),
      jsonb_build_object('range', '50-59%', 'min', 50, 'max', 59, 'count', count(*) FILTER (WHERE relevance >= 50 AND relevance < 60)),
      jsonb_build_object('range', '40-49%', 'min', 40, 'max', 49, 'count', count(*) FILTER (WHERE relevance >= 40 AND relevance < 50)),
      jsonb_build_object('range', '30-39%', 'min', 30, 'max', 39, 'count', count(*) FILTER (WHERE relevance >= 30 AND relevance < 40)),
      jsonb_build_object('range', '20-29%', 'min', 20, 'max', 29, 'count', count(*) FILTER (WHERE relevance >= 20 AND relevance < 30)),
      jsonb_build_object('range', '10-19%', 'min', 10, 'max', 19, 'count', count(*) FILTER (WHERE relevance >= 10 AND relevance < 20)),
      jsonb_build_object('range', '0-9%', 'min', 0, 'max', 9, 'count', count(*) FILTER (WHERE relevance >= 0 AND relevance < 10))
    ) FROM evals WHERE relevance IS NOT NULL),
    'top_skills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'skill', skill, 'count', cnt,
      'percentage', round(cnt * 100.0 / GREATEST((SELECT evaluated FROM totals), 1))
    ) ORDER BY cnt DESC, skill), '[]'::jsonb) FROM skill_counts),
    'applied', (SELECT coalesce(sum(cnt), 0) FROM status_counts WHERE status = 'applied'),
    'interviewing', (SELECT coalesce(sum(cnt), 0) FROM status_counts WHERE status = 'interviewing'),
    'saved', (SELECT saved FROM saved_stats),
    'interested', (SELECT saved FROM saved_stats),
    'not_interested', (SELECT coalesce(sum(cnt), 0) FROM status_counts WHERE status = 'not_interested'),
    'by_domain', (SELECT coalesce(jsonb_object_agg(name, value), '{}'::jsonb) FROM sectors_full)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION "public"."get_overview_metrics"() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."get_overview_metrics"() TO authenticated, service_role;

-- Seed the rollup now so the first post-migration request is already cached.
UPDATE public.catalog_stats SET
  job_count = (SELECT count(*) FROM public.jobs),
  locations = (SELECT coalesce(jsonb_agg(jsonb_build_object('loc', location, 'count', cnt) ORDER BY cnt DESC, location), '[]'::jsonb)
    FROM (SELECT location, count(*) AS cnt FROM public.jobs WHERE trim(coalesce(location, '')) <> '' GROUP BY location ORDER BY cnt DESC, location LIMIT 200) l),
  sectors = (SELECT coalesce(jsonb_agg(jsonb_build_object('name', sector, 'value', cnt, 'avgMatch', 0)
      ORDER BY CASE sector WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, cnt DESC, sector), '[]'::jsonb)
    FROM (SELECT coalesce(cs.sector, 'Uncategorized') AS sector, count(*) AS cnt
          FROM public.jobs j LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id GROUP BY 1) s),
  computed_at = now()
WHERE id;
