-- Bound every caller, including direct RPC consumers, and use normalized
-- salary values rather than parsing presentation text at query time.
CREATE OR REPLACE FUNCTION public.get_jobs_page(
  p_user_email text DEFAULT NULL, p_status text DEFAULT 'all', p_domain text DEFAULT 'all',
  p_min_match integer DEFAULT 0, p_location text DEFAULT 'all', p_salary text DEFAULT 'all',
  p_search text DEFAULT NULL, p_sort_by text DEFAULT 'match', p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 40, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_caller_role text := auth.role();
  v_jwt_email text := lower(auth.jwt() ->> 'email');
  v_effective_email text;
  v_effective_uid uuid;
  v_total bigint;
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
BEGIN
  IF v_caller_role = 'service_role' THEN
    v_effective_email := lower(p_user_email);
    IF v_effective_email IS NOT NULL THEN
      SELECT id INTO v_effective_uid FROM auth.users WHERE lower(email) = v_effective_email LIMIT 1;
    END IF;
  ELSE
    IF NOT public.is_authorized_user() THEN RAISE EXCEPTION 'Access denied: user is not authorized'; END IF;
    IF p_user_email IS NOT NULL AND lower(p_user_email) <> v_jwt_email THEN RAISE EXCEPTION 'Access denied: cannot query data for another user'; END IF;
    v_effective_email := v_jwt_email;
    v_effective_uid := auth.uid();
  END IF;

  WITH user_evals AS (
    SELECT job_id, relevance, fit_tier, matched_skills FROM public.user_job_evaluations
    WHERE (v_effective_uid IS NOT NULL AND user_id = v_effective_uid)
       OR (user_id IS NULL AND v_effective_email IS NOT NULL AND lower(user_email) = v_effective_email)
  ), user_stats AS (
    SELECT job_id, status FROM public.user_job_statuses
    WHERE (v_effective_uid IS NOT NULL AND user_id = v_effective_uid)
       OR (user_id IS NULL AND v_effective_email IS NOT NULL AND lower(user_email) = v_effective_email)
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
      AND (p_search IS NULL OR trim(p_search) = '' OR c.title ILIKE '%' || trim(p_search) || '%' OR c.company ILIKE '%' || trim(p_search) || '%' OR c.location ILIKE '%' || trim(p_search) || '%' OR c.matched_skills::text ILIKE '%' || trim(p_search) || '%')
      AND (p_location IS NULL OR p_location = 'all' OR c.location ILIKE '%' || p_location || '%')
      AND (p_salary IS NULL OR p_salary = 'all' OR
        (p_salary = 'disclosed' AND c.salary_max_amount IS NOT NULL) OR
        (p_salary = '50k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 50000) OR
        (p_salary = '60k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 60000) OR
        (p_salary = '70k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 70000) OR
        (p_salary = '80k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 80000))
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
