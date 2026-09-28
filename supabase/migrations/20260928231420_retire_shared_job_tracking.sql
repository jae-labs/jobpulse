DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE status IS DISTINCT FROM 'new') THEN
    RAISE EXCEPTION 'Cannot retire jobs.status while non-default shared statuses remain';
  END IF;
END;
$$;

-- Candidate evaluations are the sole source of scores and classifications.
CREATE OR REPLACE FUNCTION public.get_jobs_page(
  p_status text DEFAULT 'all',
  p_domain text DEFAULT 'all',
  p_min_match integer DEFAULT 0,
  p_location text DEFAULT 'all',
  p_salary text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'match',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 40,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_role text := auth.role();
  v_effective_uid uuid;
  v_total bigint;
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_search_pattern text;
BEGIN
  IF length(coalesce(p_search, '')) > 80 OR length(coalesce(p_location, '')) > 80 THEN
    RAISE EXCEPTION 'Search and location filters must be at most 80 characters';
  END IF;
  v_search_pattern := public.jobpulse_literal_search_pattern(coalesce(p_search, ''));
  IF v_caller_role = 'service_role' THEN
    v_effective_uid := auth.uid();
  ELSE
    IF NOT public.is_authorized_user() THEN
      RAISE EXCEPTION 'Access denied: user is not authorized';
    END IF;
    v_effective_uid := auth.uid();
  END IF;

  WITH user_evals AS (
    SELECT job_id, relevance, fit_tier, matched_skills, ai_analysis FROM public.user_job_evaluations
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), user_stats AS (
    SELECT job_id, status FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), combined AS (
    SELECT j.id, j.title, j.company, j.location, j.employment_type, j.salary_text,
      j.salary_min_amount, j.salary_max_amount, j.salary_currency, j.salary_period,
      j.url, j.source, coalesce(nullif(trim(e.ai_analysis->>'role_domain'), ''), 'General Administration') AS role_domain,
      e.ai_analysis->>'seniority_level' AS seniority_level, j.last_seen_at, coalesce(e.relevance, 0) AS relevance,
      coalesce(e.fit_tier, 'Unassessed') AS fit_tier,
      coalesce(e.matched_skills, '[]'::jsonb) AS matched_skills,
      coalesce(s.status, 'new') AS status
    FROM public.jobs j LEFT JOIN user_evals e ON e.job_id = j.id LEFT JOIN user_stats s ON s.job_id = j.id
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR c.status = p_status)
      AND (p_domain IS NULL OR p_domain = 'all' OR c.role_domain = p_domain)
      AND (p_min_match IS NULL OR p_min_match <= 0 OR c.relevance >= p_min_match)
      AND (p_search IS NULL OR trim(p_search) = '' OR c.title ILIKE v_search_pattern ESCAPE chr(92) OR c.company ILIKE v_search_pattern ESCAPE chr(92) OR c.location ILIKE v_search_pattern ESCAPE chr(92) OR c.matched_skills::text ILIKE v_search_pattern ESCAPE chr(92))
      AND (p_location IS NULL OR p_location = 'all' OR c.location ILIKE public.jobpulse_literal_search_pattern(p_location) ESCAPE chr(92))
      AND (p_salary IS NULL OR p_salary = 'all' OR
        (p_salary = 'disclosed' AND (c.salary_max_amount IS NOT NULL OR c.salary_min_amount IS NOT NULL)) OR
        (c.salary_currency = 'EUR' AND c.salary_period = 'annual' AND (
          (p_salary = '50k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 50000) OR
          (p_salary = '60k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 60000) OR
          (p_salary = '70k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 70000) OR
          (p_salary = '80k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 80000))))
  ), counted AS (SELECT count(*) AS total FROM filtered), paginated AS (
    SELECT * FROM filtered ORDER BY
      CASE WHEN p_sort_by = 'match' AND p_sort_dir = 'asc' THEN relevance END ASC,
      CASE WHEN p_sort_by = 'match' AND p_sort_dir <> 'asc' THEN relevance END DESC,
      CASE WHEN p_sort_by = 'location' AND p_sort_dir = 'desc' THEN location END DESC,
      CASE WHEN p_sort_by = 'location' AND p_sort_dir <> 'desc' THEN location END ASC,
      CASE WHEN p_sort_by = 'category' AND p_sort_dir = 'desc' THEN role_domain END DESC,
      CASE WHEN p_sort_by = 'category' AND p_sort_dir <> 'desc' THEN role_domain END ASC,
      CASE WHEN p_sort_by = 'salary' AND p_sort_dir = 'asc' THEN coalesce(salary_min_amount, salary_max_amount) END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'salary' AND p_sort_dir <> 'asc' THEN coalesce(salary_max_amount, salary_min_amount) END DESC NULLS LAST,
      relevance DESC,
      id DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT (SELECT total FROM counted), coalesce((SELECT jsonb_agg(row_to_json(r)) FROM paginated r), '[]'::jsonb) INTO v_total, v_items;
  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_jobs_page(text, text, integer, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jobs_page(text, text, integer, text, text, text, text, text, integer, integer) TO authenticated, service_role;

-- Add per-stage average match to the overview chart payload.
CREATE OR REPLACE FUNCTION public.get_overview_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_role text := auth.role();
  v_effective_uid uuid;
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

  WITH user_evals AS (
    SELECT job_id, relevance, matched_skills, ai_analysis
    FROM public.user_job_evaluations
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ),
  user_stats AS (
    SELECT job_id, status
    FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ),
  combined AS (
    SELECT
      COALESCE(e.relevance, 0) AS relevance,
      COALESCE(s.status, 'new') AS status,
      COALESCE(NULLIF(TRIM(e.ai_analysis->>'role_domain'), ''), 'General Administration') AS role_domain,
      COALESCE(e.matched_skills, '[]'::jsonb) AS matched_skills
    FROM public.jobs j
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id
  ),
  status_counts AS (
    SELECT status, count(*) AS count, round(avg(relevance)) AS avg_match
    FROM combined
    GROUP BY status
  ),
  domain_counts AS (
    SELECT role_domain, count(*) AS count, round(avg(relevance)) AS avg_match
    FROM combined
    GROUP BY role_domain
  ),
  skill_counts AS (
    SELECT skill.value AS skill, count(*) AS count
    FROM combined c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(c.matched_skills) = 'array' THEN c.matched_skills ELSE '[]'::jsonb END
    ) AS skill(value)
    WHERE trim(skill.value) <> ''
    GROUP BY skill.value
    ORDER BY count DESC, skill.value
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM combined),
    'high_fit', (SELECT count(*) FROM combined WHERE relevance >= 75),
    'counts', (SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) FROM status_counts),
    'stage_averages', (SELECT COALESCE(jsonb_object_agg(status, avg_match), '{}'::jsonb) FROM status_counts),
    'categories', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', role_domain, 'value', count, 'avgMatch', avg_match
    ) ORDER BY count DESC, role_domain), '[]'::jsonb) FROM domain_counts),
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
    ) FROM combined),
    'top_skills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'skill', skill, 'count', count,
      'percentage', round(count * 100.0 / GREATEST((SELECT count(*) FROM combined), 1))
    ) ORDER BY count DESC, skill), '[]'::jsonb) FROM skill_counts),
    -- Keep the fields added by the hardened RPC for existing API consumers.
    'applied', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'applied'),
    'interviewing', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'interviewing'),
    'interested', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'interested'),
    'not_interested', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'not_interested'),
    'by_domain', (SELECT COALESCE(jsonb_object_agg(role_domain, count), '{}'::jsonb) FROM domain_counts)
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_overview_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_metrics() TO authenticated, service_role;

-- Candidate tracking has one source of truth. Unexpected dependencies fail closed.
ALTER TABLE public.jobs DROP COLUMN status;
DROP FUNCTION public.is_admin();
ALTER TABLE public.jobs VALIDATE CONSTRAINT jobs_salary_amounts_valid;
