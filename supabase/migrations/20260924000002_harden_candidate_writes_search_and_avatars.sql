-- Keep legacy email columns consistent with the immutable Auth owner. The
-- browser cannot reserve another candidate's unique profile email.
CREATE OR REPLACE FUNCTION public.set_user_id_from_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE verified_email text;
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    SELECT lower(account.email) INTO verified_email
    FROM auth.users account WHERE account.id = (SELECT auth.uid());
    IF verified_email IS NULL THEN
      RAISE EXCEPTION 'Active Auth user required';
    END IF;
    NEW.user_id := (SELECT auth.uid());
    NEW.user_email := verified_email;
  ELSE
    IF NEW.user_id IS NULL THEN NEW.user_id := auth.uid(); END IF;
    IF NEW.user_id IS NULL AND NEW.user_email IS NOT NULL THEN
      SELECT account.id INTO NEW.user_id FROM auth.users account
      WHERE lower(account.email) = lower(NEW.user_email) LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Avatar links should be owner-only. Existing email-prefixed objects remain
-- readable by their verified owner during migration to UID-prefixed paths.
UPDATE storage.buckets SET public = false WHERE id = 'avatars';
DROP POLICY IF EXISTS "Users can read own avatar metadata" ON storage.objects;
CREATE POLICY "Users can read own avatar metadata" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[1] = lower(auth.jwt() ->> 'email')
    )
  );

-- Other avatar policies still allow writes only under the UID path.

-- Bound and literal search. Keep the trigram-friendly ILIKE form, but escape
-- SQL pattern metacharacters supplied by a user.
CREATE OR REPLACE FUNCTION public.jobpulse_literal_search_pattern(input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '%' || replace(replace(replace(trim(input), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
$$;
REVOKE ALL ON FUNCTION public.jobpulse_literal_search_pattern(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jobpulse_literal_search_pattern(text) TO authenticated, service_role;

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
  v_search_pattern text;
BEGIN
  IF length(coalesce(p_search, '')) > 80 OR length(coalesce(p_location, '')) > 80 THEN
    RAISE EXCEPTION 'Search and location filters must be at most 80 characters';
  END IF;
  v_search_pattern := public.jobpulse_literal_search_pattern(coalesce(p_search, ''));
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
