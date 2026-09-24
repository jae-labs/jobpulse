-- Invitations are claimed only by a verified Auth identity. Once claimed, the
-- invitation stays bound to that immutable ID even if the address changes or
-- is later registered by somebody else. An administrator must explicitly
-- replace a binding to transfer an invitation.
ALTER TABLE public.authorized_users ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS authorized_users_user_id_key
  ON public.authorized_users (user_id) WHERE user_id IS NOT NULL;

UPDATE public.authorized_users invitation
SET user_id = account.id
FROM auth.users account
WHERE invitation.user_id IS NULL
  AND invitation.email = lower(account.email)
  AND account.email_confirmed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bind_verified_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND NEW.email IS NOT NULL THEN
    UPDATE public.authorized_users
    SET user_id = NEW.id
    WHERE email = lower(NEW.email) AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bind_verified_invitation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bind_verified_invitation ON auth.users;
CREATE TRIGGER bind_verified_invitation
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bind_verified_invitation();

CREATE OR REPLACE FUNCTION public.bind_existing_verified_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT account.id INTO NEW.user_id
    FROM auth.users account
    WHERE lower(account.email) = NEW.email
      AND account.email_confirmed_at IS NOT NULL
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bind_existing_verified_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bind_existing_verified_account ON public.authorized_users;
CREATE TRIGGER bind_existing_verified_account
  BEFORE INSERT OR UPDATE OF email ON public.authorized_users
  FOR EACH ROW EXECUTE FUNCTION public.bind_existing_verified_account();

CREATE OR REPLACE FUNCTION public.is_authorized_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users invitation
    JOIN auth.users account ON account.id = invitation.user_id
    WHERE invitation.user_id = (SELECT auth.uid())
      AND account.email_confirmed_at IS NOT NULL
  );
$$;

DROP POLICY IF EXISTS "Users can only check own authorization" ON public.authorized_users;
CREATE POLICY "Users can only check own authorization" ON public.authorized_users
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Legacy email-only rows remain in the database for owner-reviewed recovery,
-- but cannot be claimed by a different account that later gets the address.
CREATE OR REPLACE FUNCTION public.current_user_owns_row(row_user_id uuid, row_user_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT row_user_id = (SELECT auth.uid());
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_key ON public.user_profiles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_job_statuses_user_id_job_key ON public.user_job_statuses (user_id, job_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_job_evaluations_user_id_job_key ON public.user_job_evaluations (user_id, job_id);

DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
CREATE POLICY "Users read own profile" ON public.user_profiles
  FOR SELECT TO authenticated USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users read own cv" ON public.user_cvs;
CREATE POLICY "Users read own cv" ON public.user_cvs
  FOR SELECT TO authenticated USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users read own cover letter" ON public.user_cover_letters;
CREATE POLICY "Users read own cover letter" ON public.user_cover_letters
  FOR SELECT TO authenticated USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users read own statuses" ON public.user_job_statuses;
CREATE POLICY "Users read own statuses" ON public.user_job_statuses
  FOR SELECT TO authenticated USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users read own evaluations" ON public.user_job_evaluations;
CREATE POLICY "Users read own evaluations" ON public.user_job_evaluations
  FOR SELECT TO authenticated USING ((SELECT public.is_authorized_user()) AND user_id = (SELECT auth.uid()));

-- One metadata row reserves each document path before its bytes are uploaded.
-- Serialize reservations for the same user so simultaneous inserts cannot
-- both pass the ten-document count.
CREATE OR REPLACE FUNCTION public.check_user_cv_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.user_id := coalesce(NEW.user_id, auth.uid());
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF; -- trusted imports of legacy rows
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text || ':cv', 0));
  IF (SELECT count(*) FROM public.user_cvs WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum document limit of 10 CVs reached';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.check_user_cover_letter_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.user_id := coalesce(NEW.user_id, auth.uid());
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF; -- trusted imports of legacy rows
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text || ':cover-letter', 0));
  IF (SELECT count(*) FROM public.user_cover_letters WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum document limit of 10 cover letters reached';
  END IF;
  RETURN NEW;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS user_cvs_storage_path_key ON public.user_cvs (storage_path) WHERE storage_path IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_cover_letters_storage_path_key ON public.user_cover_letters (storage_path) WHERE storage_path IS NOT NULL;

CREATE OR REPLACE FUNCTION public.owns_document_object(object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT public.is_authorized_user()) AND (
    EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = (SELECT auth.uid()) AND storage_path = object_name)
    OR EXISTS (SELECT 1 FROM public.user_cover_letters WHERE user_id = (SELECT auth.uid()) AND storage_path = object_name)
  );
$$;
REVOKE ALL ON FUNCTION public.owns_document_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_document_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can only view own storage documents" ON storage.objects;
CREATE POLICY "Users can only view own storage documents" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'user-documents' AND (SELECT public.owns_document_object(name))
  );
DROP POLICY IF EXISTS "Users can only upload own storage documents" ON storage.objects;
CREATE POLICY "Users can only upload own storage documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'user-documents'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND (SELECT public.owns_document_object(name))
  );
DROP POLICY IF EXISTS "Users can only update own storage documents" ON storage.objects;
CREATE POLICY "Users can only update own storage documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'user-documents' AND (SELECT public.owns_document_object(name)))
  WITH CHECK (bucket_id = 'user-documents' AND (SELECT public.owns_document_object(name)));
DROP POLICY IF EXISTS "Users can only delete own storage documents" ON storage.objects;
CREATE POLICY "Users can only delete own storage documents" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'user-documents' AND (SELECT public.owns_document_object(name))
  );

-- Public avatar URLs must not disclose the user's email address.
DROP POLICY IF EXISTS "Users can read own avatar metadata" ON storage.objects;
CREATE POLICY "Users can read own avatar metadata" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Do not present non-annual compensation as an annual comparison.
UPDATE public.jobs SET salary_period = 'hourly'
WHERE salary_text ~* '(/\s*(h|hr|hour)($|[^[:alpha:]])|per\s+hour|hourly)';
UPDATE public.jobs SET salary_period = 'daily'
WHERE salary_text ~* '(/\s*(d|day)($|[^[:alpha:]])|per\s+day|daily)';
UPDATE public.jobs SET salary_period = 'weekly'
WHERE salary_text ~* '(/\s*(wk|week)($|[^[:alpha:]])|per\s+week|weekly)';
UPDATE public.jobs SET salary_period = 'monthly'
WHERE salary_text ~* '(/\s*(mo|month)($|[^[:alpha:]])|per\s+month|monthly)';
UPDATE public.jobs SET salary_currency = 'EUR'
WHERE salary_currency IS NULL AND salary_text ~* '(€|(^|[^[:alpha:]])EUR($|[^[:alpha:]]))';

-- SECURITY DEFINER RPCs must not reintroduce email fallback for orphan rows.
CREATE OR REPLACE FUNCTION public.get_overview_metrics(p_user_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_caller_role TEXT := auth.role();
    v_jwt_email TEXT := lower(auth.jwt() ->> 'email');
    v_effective_email TEXT;
    v_effective_uid UUID;
    result JSONB;
BEGIN
    IF v_caller_role = 'service_role' THEN
        v_effective_email := lower(p_user_email);
        IF v_effective_email IS NOT NULL THEN
            SELECT id INTO v_effective_uid FROM auth.users WHERE lower(email) = v_effective_email LIMIT 1;
        END IF;
    ELSE
        IF NOT public.is_authorized_user() THEN
            RAISE EXCEPTION 'Access denied: user is not authorized';
        END IF;

        IF p_user_email IS NOT NULL AND lower(p_user_email) <> v_jwt_email THEN
            RAISE EXCEPTION 'Access denied: cannot query data for another user';
        END IF;

        v_effective_email := v_jwt_email;
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
        'counts', (
            SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
            FROM (
                SELECT status, count(*) AS cnt
                FROM combined
                GROUP BY status
            ) st
        ),
        'categories', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('name', role_domain, 'value', cnt, 'avgMatch', round(avg_rel))), '[]'::jsonb)
            FROM (
                SELECT role_domain, count(*) AS cnt, avg(relevance) AS avg_rel
                FROM combined
                GROUP BY role_domain
                ORDER BY cnt DESC
            ) cat
        ),
        'relevance_distribution', (
            SELECT jsonb_build_array(
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
            )
            FROM combined
        ),
        'top_skills', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('skill', skill, 'count', cnt, 'percentage', round((cnt::numeric / GREATEST((SELECT count(*) FROM combined)::numeric, 1)) * 100))), '[]'::jsonb)
            FROM (
                SELECT elem AS skill, count(*) AS cnt
                FROM combined, jsonb_array_elements_text(
                    CASE 
                        WHEN jsonb_typeof(matched_skills) = 'array' THEN matched_skills 
                        ELSE '[]'::jsonb 
                    END
                ) AS elem
                WHERE trim(elem) <> ''
                GROUP BY skill
                ORDER BY cnt DESC
                LIMIT 6
            ) sk
        )
    ) INTO result;

    RETURN result;
END;
$function$;

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
      AND (p_search IS NULL OR trim(p_search) = '' OR c.title ILIKE '%' || trim(p_search) || '%' OR c.company ILIKE '%' || trim(p_search) || '%' OR c.location ILIKE '%' || trim(p_search) || '%' OR c.matched_skills::text ILIKE '%' || trim(p_search) || '%')
      AND (p_location IS NULL OR p_location = 'all' OR c.location ILIKE '%' || p_location || '%')
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
