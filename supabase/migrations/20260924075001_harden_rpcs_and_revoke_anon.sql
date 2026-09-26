-- ==============================================================================
-- Migration: Harden RPCs and Revoke Unauthenticated Function Access
-- 1. Revoke execute on is_authorized_user() from anon
-- 2. Drop legacy p_user_email from get_overview_metrics() and bind to auth.uid()
-- 3. Drop legacy p_user_email from get_jobs_page() and bind to auth.uid()
-- ==============================================================================

-- 1. REVOKE ANON ACCESS ON is_authorized_user()
REVOKE ALL ON FUNCTION public.is_authorized_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authorized_user() TO authenticated, service_role;

-- 2. HARDEN get_overview_metrics()
DROP FUNCTION IF EXISTS public.get_overview_metrics(text);

CREATE OR REPLACE FUNCTION public.get_overview_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_role TEXT := auth.role();
  v_effective_uid UUID;
  result JSONB;
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
    SELECT job_id, relevance, matched_skills
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
      j.id,
      COALESCE(e.relevance, j.relevance, 0) AS relevance,
      COALESCE(s.status, j.status, 'new') AS status,
      COALESCE(NULLIF(TRIM(j.role_domain), ''), 'General Administration') AS role_domain,
      COALESCE(e.matched_skills, j.matched_skills, '[]'::jsonb) AS matched_skills
    FROM public.jobs j
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM combined),
    'high_fit', (SELECT count(*) FROM combined WHERE relevance >= 75),
    'applied', (SELECT count(*) FROM combined WHERE status = 'applied'),
    'interviewing', (SELECT count(*) FROM combined WHERE status = 'interviewing'),
    'interested', (SELECT count(*) FROM combined WHERE status = 'interested'),
    'not_interested', (SELECT count(*) FROM combined WHERE status = 'not_interested'),
    'by_domain', COALESCE((
      SELECT jsonb_object_agg(role_domain, count)
      FROM (
        SELECT role_domain, count(*) AS count
        FROM combined
        GROUP BY role_domain
      ) domain_counts
    ), '{}'::jsonb),
    'top_skills', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('skill', skill, 'count', count))
      FROM (
        SELECT skill, count(*) AS count
        FROM combined,
        LATERAL jsonb_array_elements_text(matched_skills) AS skill
        WHERE trim(skill) <> ''
        GROUP BY skill
        ORDER BY count DESC
        LIMIT 10
      ) skill_counts
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_overview_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_metrics() TO authenticated, service_role;

-- 3. HARDEN get_jobs_page()
DROP FUNCTION IF EXISTS public.get_jobs_page(text, text, text, integer, text, text, text, text, text, integer, integer);

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
    SELECT job_id, relevance, fit_tier, matched_skills FROM public.user_job_evaluations
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), user_stats AS (
    SELECT job_id, status FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), combined AS (
    SELECT j.id, j.title, j.company, j.location, j.employment_type, j.salary_text,
      j.salary_min_amount, j.salary_max_amount, j.salary_currency, j.salary_period,
      j.url, j.source, coalesce(nullif(trim(j.role_domain), ''), 'General Administration') AS role_domain,
      j.seniority_level, j.last_seen_at, coalesce(e.relevance, j.relevance, 0) AS relevance,
      coalesce(e.fit_tier, j.fit_tier, 'Unassessed') AS fit_tier,
      coalesce(e.matched_skills, j.matched_skills, '[]'::jsonb) AS matched_skills,
      coalesce(s.status, j.status, 'new') AS status
    FROM public.jobs j LEFT JOIN user_evals e ON e.job_id = j.id LEFT JOIN user_stats s ON s.job_id = j.id
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR c.status = p_status)
      AND (p_domain IS NULL OR p_domain = 'all' OR c.role_domain = p_domain)
      AND (p_min_match IS NULL OR p_min_match <= 0 OR c.relevance >= p_min_match)
      AND (p_search IS NULL OR trim(p_search) = '' OR c.title ILIKE v_search_pattern ESCAPE chr(92) OR c.company ILIKE v_search_pattern ESCAPE chr(92) OR c.location ILIKE v_search_pattern ESCAPE chr(92) OR c.matched_skills::text ILIKE v_search_pattern ESCAPE chr(92))
      AND (p_location IS NULL OR p_location = 'all' OR c.location ILIKE public.jobpulse_literal_search_pattern(p_location) ESCAPE chr(92))
      AND (p_salary IS NULL OR p_salary = 'all' OR
        (p_salary = 'disclosed' AND c.salary_max_amount IS NOT NULL) OR
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
      CASE WHEN p_sort_by = 'salary' AND p_sort_dir = 'asc' THEN coalesce(salary_max_amount, salary_min_amount) END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'salary' AND p_sort_dir <> 'asc' THEN coalesce(salary_max_amount, salary_min_amount) END DESC NULLS LAST,
      id DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT (SELECT total FROM counted), coalesce((SELECT jsonb_agg(row_to_json(r)) FROM paginated r), '[]'::jsonb) INTO v_total, v_items;
  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_jobs_page(text, text, integer, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jobs_page(text, text, integer, text, text, text, text, text, integer, integer) TO authenticated, service_role;
