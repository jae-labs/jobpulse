


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."bind_existing_verified_account"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT account.id INTO NEW.user_id
    FROM auth.users account
    WHERE lower(account.email) = NEW.email
      AND account.email_confirmed_at IS NOT NULL
    LIMIT 1;
    IF NEW.user_id IS NOT NULL THEN
      NEW.status := 'accepted';
      NEW.accepted_at := coalesce(NEW.accepted_at, clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bind_existing_verified_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bind_verified_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND NEW.email IS NOT NULL THEN
    UPDATE public.authorized_users
    SET user_id = NEW.id,
        status = 'accepted',
        accepted_at = coalesce(accepted_at, clock_timestamp())
    WHERE email = lower(NEW.email)
      AND (user_id IS NULL OR user_id = NEW.id)
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bind_verified_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_cover_letter_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."check_user_cover_letter_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_cv_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."check_user_cv_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invitation"("target_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  clean_email text := lower(trim(target_email));
  new_invite_code text;
  res_id bigint;
  existing_status text;
  existing_id bigint;
  existing_code text;
BEGIN
  -- 1. Ensure caller is an active, authorized user
  IF caller_id IS NULL OR NOT (SELECT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Unauthorized: only active members can send invitations';
  END IF;

  -- 2. Validate email syntax
  IF clean_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address format';
  END IF;

  -- 3. Check existing invitation or user
  SELECT id, status, invite_code INTO existing_id, existing_status, existing_code
  FROM public.authorized_users
  WHERE email = clean_email;

  IF existing_id IS NOT NULL THEN
    IF existing_status = 'accepted' THEN
      RAISE EXCEPTION 'User with email % is already an active member', clean_email;
    ELSIF existing_status = 'pending' THEN
      -- If someone else (or same user) already invited this person,
      -- return the existing pending invitation code so they can share the link without collision
      RETURN json_build_object(
        'success', true,
        'id', existing_id,
        'email', clean_email,
        'role', 'member',
        'invite_code', existing_code,
        'status', 'pending',
        'already_pending', true
      );
    END IF;
  END IF;

  -- 4. Create new pending invitation
  new_invite_code := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  INSERT INTO public.authorized_users (email, role, invited_by, invite_code, status)
  VALUES (clean_email, 'member', caller_id, new_invite_code, 'pending')
  RETURNING id INTO res_id;

  RETURN json_build_object(
    'success', true,
    'id', res_id,
    'email', clean_email,
    'role', 'member',
    'invite_code', new_invite_code,
    'status', 'pending',
    'already_pending', false
  );
END;
$_$;


ALTER FUNCTION "public"."create_invitation"("target_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_invitation"("invitation_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  invite_row public.authorized_users%ROWTYPE;
BEGIN
  IF caller_id IS NULL OR NOT (SELECT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO invite_row
  FROM public.authorized_users
  WHERE id = invitation_id;

  IF invite_row.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF invite_row.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot delete an active member account';
  END IF;

  -- Physically remove the pending invitation row
  DELETE FROM public.authorized_users
  WHERE id = invitation_id AND status = 'pending';

  RETURN json_build_object('success', true, 'id', invitation_id);
END;
$$;


ALTER FUNCTION "public"."delete_invitation"("invitation_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_job_scoring_work"("p_jobs" "jsonb", "p_profiles" "jsonb", "p_model_version" "text", "p_scoring_version" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    IF jsonb_array_length(p_jobs) > 100 OR jsonb_array_length(p_profiles) > 100 THEN
        RAISE EXCEPTION 'Scoring work is limited to 100 jobs and 100 profiles per call';
    END IF;
    RETURN (
        WITH job_inputs AS (
            SELECT * FROM jsonb_to_recordset(p_jobs)
                AS j(job_id bigint, content_hash text, embedding_hash text)
        ), profile_inputs AS (
            SELECT * FROM jsonb_to_recordset(p_profiles)
                AS p(user_id uuid, content_hash text, embedding_hash text)
        ), pairs AS (
            SELECT j.job_id, p.user_id, j.content_hash AS job_hash, p.content_hash AS profile_hash,
                CASE WHEN je.embedding IS NOT NULL AND pe.embedding IS NOT NULL
                    THEN greatest(0.0, least(1.0, 1.0 - (je.embedding OPERATOR(extensions.<=>) pe.embedding)))
                    ELSE NULL END AS semantic_similarity,
                p_scoring_version || CASE WHEN je.embedding IS NULL OR pe.embedding IS NULL
                    THEN ':fallback' ELSE '' END AS version
            FROM job_inputs j CROSS JOIN profile_inputs p
            LEFT JOIN public.job_scoring_embeddings je ON je.job_id = j.job_id
                AND je.content_hash = j.embedding_hash AND je.model_version = p_model_version
            LEFT JOIN public.profile_scoring_embeddings pe ON pe.user_id = p.user_id
                AND pe.content_hash = p.embedding_hash AND pe.model_version = p_model_version
        )
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'job_id', pairs.job_id, 'user_id', pairs.user_id,
            'semantic_similarity', pairs.semantic_similarity, 'scoring_version', pairs.version
        )), '[]'::jsonb)
        FROM pairs
        LEFT JOIN public.user_job_evaluations e ON e.job_id = pairs.job_id AND e.user_id = pairs.user_id
        WHERE e.scoring_job_hash IS DISTINCT FROM pairs.job_hash
            OR e.scoring_profile_hash IS DISTINCT FROM pairs.profile_hash
            OR e.scoring_version IS DISTINCT FROM pairs.version
    );
END;
$$;


ALTER FUNCTION "public"."get_job_scoring_work"("p_jobs" "jsonb", "p_profiles" "jsonb", "p_model_version" "text", "p_scoring_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_jobs_page"("p_status" "text" DEFAULT 'all'::"text", "p_domain" "text" DEFAULT 'all'::"text", "p_min_match" integer DEFAULT 0, "p_location" "text" DEFAULT 'all'::"text", "p_salary" "text" DEFAULT 'all'::"text", "p_search" "text" DEFAULT NULL::"text", "p_sort_by" "text" DEFAULT 'match'::"text", "p_sort_dir" "text" DEFAULT 'desc'::"text", "p_limit" integer DEFAULT 40, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_jobs_page"("p_status" "text", "p_domain" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_overview_metrics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_overview_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_authorized_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users invitation
    JOIN auth.users account ON account.id = invitation.user_id
    WHERE invitation.user_id = (SELECT auth.uid())
      AND invitation.status = 'accepted'
      AND account.email_confirmed_at IS NOT NULL
  );
$$;


ALTER FUNCTION "public"."is_authorized_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT '%' || replace(replace(replace(trim(input), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
$$;


ALTER FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_job_salary"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_lower text;
  v_range_thousands text[];
  v_range_comma text[];
  v_range_plain text[];
  v_single_thousands text[];
  v_single_comma text[];
  v_single_plain text[];
BEGIN
  -- Refresh derived facts when raw pay changes; retain explicitly supplied facts.
  IF TG_OP = 'UPDATE' AND NEW.salary_text IS DISTINCT FROM OLD.salary_text THEN
    IF NEW.salary_min_amount IS NOT DISTINCT FROM OLD.salary_min_amount THEN NEW.salary_min_amount := NULL; END IF;
    IF NEW.salary_max_amount IS NOT DISTINCT FROM OLD.salary_max_amount THEN NEW.salary_max_amount := NULL; END IF;
    IF NEW.salary_currency IS NOT DISTINCT FROM OLD.salary_currency THEN NEW.salary_currency := NULL; END IF;
    IF NEW.salary_period IS NOT DISTINCT FROM OLD.salary_period THEN NEW.salary_period := NULL; END IF;
  END IF;
  IF NEW.salary_text IS NOT NULL AND trim(NEW.salary_text) <> '' THEN
    v_lower := lower(NEW.salary_text);

    -- Currency detection
    IF NEW.salary_currency IS NULL THEN
      IF NEW.salary_text ~ '€' OR v_lower ~ 'eur' THEN
        NEW.salary_currency := 'EUR';
      ELSIF NEW.salary_text ~ '\$' OR v_lower ~ 'usd' THEN
        NEW.salary_currency := 'USD';
      ELSIF NEW.salary_text ~ '£' OR v_lower ~ 'gbp' THEN
        NEW.salary_currency := 'GBP';
      ELSE
        NEW.salary_currency := 'EUR';
      END IF;
    END IF;

    -- Period detection
    IF NEW.salary_period IS NULL THEN
      IF v_lower ~ '\m(hours?|hourly|hr|ph)\M|/hr' THEN
        NEW.salary_period := 'hourly';
      ELSIF v_lower ~ '\m(days?|daily)\M|/day' THEN
        NEW.salary_period := 'daily';
      ELSIF v_lower ~ '\m(months?|monthly|mo)\M|/mo' THEN
        NEW.salary_period := 'monthly';
      ELSIF v_lower ~ '\m(weeks?|weekly)\M|/week' THEN
        NEW.salary_period := 'weekly';
      ELSE
        NEW.salary_period := 'annual';
      END IF;
    END IF;

    -- Extract min and max amounts if not already set
    IF NEW.salary_min_amount IS NULL OR NEW.salary_max_amount IS NULL THEN
      v_range_comma := regexp_match(NEW.salary_text, '([0-9]{2,3}),([0-9]{3})\D+([0-9]{2,3}),([0-9]{3})');
      v_range_thousands := regexp_match(v_lower, '([0-9]{2,3}(?:\.[0-9]+)?)\s*k?\s*(?:-|–|to)\s*[€£$]?\s*([0-9]{2,3}(?:\.[0-9]+)?)\s*k');
      v_range_plain := regexp_match(NEW.salary_text, '([0-9]{5,6})\D+([0-9]{5,6})');
      v_single_comma := regexp_match(NEW.salary_text, '([0-9]{2,3}),([0-9]{3})');
      v_single_thousands := regexp_match(v_lower, '([0-9]{2,3}(?:\.[0-9]+)?)\s*k');
      v_single_plain := regexp_match(NEW.salary_text, '([0-9]{5,6})');

      IF v_range_comma IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, (v_range_comma[1] || v_range_comma[2])::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, (v_range_comma[3] || v_range_comma[4])::integer);
      ELSIF v_range_thousands IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_range_thousands[1]::numeric * 1000);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_range_thousands[2]::numeric * 1000);
      ELSIF v_range_plain IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_range_plain[1]::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_range_plain[2]::integer);
      ELSIF v_single_comma IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, (v_single_comma[1] || v_single_comma[2])::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, (v_single_comma[1] || v_single_comma[2])::integer);
      ELSIF v_single_thousands IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_single_thousands[1]::numeric * 1000);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_single_thousands[1]::numeric * 1000);
      ELSIF v_single_plain IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_single_plain[1]::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_single_plain[1]::integer);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."normalize_job_salary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_document_object"("object_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT (SELECT public.is_authorized_user()) AND (
    EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = (SELECT auth.uid()) AND storage_path = object_name)
    OR EXISTS (SELECT 1 FROM public.user_cover_letters WHERE user_id = (SELECT auth.uid()) AND storage_path = object_name)
  );
$$;


ALTER FUNCTION "public"."owns_document_object"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_deleted_account_access"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Remove the deleted member's access and unclaimed invitations they issued.
  -- Accepted members remain; their invited_by FK becomes NULL on deletion.
  DELETE FROM public.authorized_users
  WHERE user_id = OLD.id
     OR (invited_by = OLD.id AND status = 'pending');

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."purge_deleted_account_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_id_from_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    NEW.user_id := (SELECT auth.uid());
  ELSE
    IF NEW.user_id IS NULL THEN NEW.user_id := auth.uid(); END IF;
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Active Auth user required';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_user_id_from_auth"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."authorized_users" (
    "id" bigint NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "invited_by" "uuid",
    "invite_code" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "authorized_users_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"]))),
    CONSTRAINT "check_authorized_users_email_lowercase" CHECK (("email" = "lower"("email")))
);


ALTER TABLE "public"."authorized_users" OWNER TO "postgres";


ALTER TABLE "public"."authorized_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."authorized_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."employers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "sector" "text" NOT NULL,
    "priority" integer DEFAULT 1 NOT NULL,
    "careers_url" "text" NOT NULL,
    "discovered_jobs_url" "text",
    "last_scraped_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "opportunities_found" integer DEFAULT 0
);


ALTER TABLE "public"."employers" OWNER TO "postgres";


ALTER TABLE "public"."employers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."employers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."job_scoring_embeddings" (
    "job_id" bigint NOT NULL,
    "content_hash" "text" NOT NULL,
    "model_version" "text" NOT NULL,
    "embedding" "extensions"."vector"(384) NOT NULL
);


ALTER TABLE "public"."job_scoring_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" bigint NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "company" "text" NOT NULL,
    "location" "text" DEFAULT 'Not specified'::"text" NOT NULL,
    "employment_type" "text" DEFAULT 'Not specified'::"text" NOT NULL,
    "salary_text" "text",
    "description" "text" NOT NULL,
    "url" "text" NOT NULL,
    "source" "text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "salary_min_amount" integer,
    "salary_max_amount" integer,
    "salary_currency" "text",
    "salary_period" "text",
    CONSTRAINT "jobs_salary_amounts_valid" CHECK (((("salary_min_amount" IS NULL) OR ("salary_min_amount" >= 0)) AND (("salary_max_amount" IS NULL) OR ("salary_max_amount" >= 0)) AND (("salary_min_amount" IS NULL) OR ("salary_max_amount" IS NULL) OR ("salary_min_amount" <= "salary_max_amount"))))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."jobs"."salary_text" IS 'Original source display text; do not use for numeric filtering or sorting.';



COMMENT ON COLUMN "public"."jobs"."salary_min_amount" IS 'Minimum advertised amount in salary_currency per salary_period; not necessarily annual.';



COMMENT ON COLUMN "public"."jobs"."salary_max_amount" IS 'Maximum advertised amount in salary_currency per salary_period; not necessarily annual.';



ALTER TABLE "public"."jobs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."jobs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profile_scoring_embeddings" (
    "user_id" "uuid" NOT NULL,
    "content_hash" "text" NOT NULL,
    "model_version" "text" NOT NULL,
    "embedding" "extensions"."vector"(384) NOT NULL
);


ALTER TABLE "public"."profile_scoring_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sources" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "mode" "text" DEFAULT 'feed'::"text" NOT NULL,
    "last_status" "text" DEFAULT 'Not synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "detail" "text",
    "opportunities_found" integer DEFAULT 0
);


ALTER TABLE "public"."sources" OWNER TO "postgres";


ALTER TABLE "public"."sources" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."sources_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_cover_letters" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer DEFAULT 0 NOT NULL,
    "mime_type" "text" DEFAULT 'application/pdf'::"text" NOT NULL,
    "storage_path" "text",
    "description" "text" DEFAULT ''::"text",
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_cover_letters" OWNER TO "postgres";


ALTER TABLE "public"."user_cover_letters" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_cover_letters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_cvs" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer DEFAULT 0 NOT NULL,
    "mime_type" "text" DEFAULT 'application/pdf'::"text" NOT NULL,
    "storage_path" "text",
    "description" "text" DEFAULT ''::"text",
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_cvs" OWNER TO "postgres";


ALTER TABLE "public"."user_cvs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_cvs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_job_evaluations" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" bigint NOT NULL,
    "relevance" integer DEFAULT 0 NOT NULL,
    "fit_tier" "text" DEFAULT 'Unassessed'::"text" NOT NULL,
    "matched_skills" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ai_analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    "scoring_job_hash" "text",
    "scoring_profile_hash" "text",
    "scoring_version" "text"
);


ALTER TABLE "public"."user_job_evaluations" OWNER TO "postgres";


ALTER TABLE "public"."user_job_evaluations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_job_evaluations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_job_statuses" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" bigint NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_job_statuses" OWNER TO "postgres";


ALTER TABLE "public"."user_job_statuses" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_job_statuses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "first_name" "text" DEFAULT ''::"text",
    "last_name" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "linkedin_url" "text" DEFAULT ''::"text",
    "work_authorization" "text" DEFAULT 'EU Citizen'::"text",
    "gender" "text" DEFAULT ''::"text",
    "headline" "text" DEFAULT ''::"text" NOT NULL,
    "current_role" "text" DEFAULT ''::"text" NOT NULL,
    "current_company" "text" DEFAULT ''::"text",
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "target_roles" "text"[] DEFAULT '{}'::"text"[],
    "target_locations" "text"[] DEFAULT '{}'::"text"[],
    "work_mode" "text" DEFAULT 'Hybrid'::"text",
    "salary_min" integer DEFAULT 50000 NOT NULL,
    "employment" "text" DEFAULT 'Permanent only'::"text" NOT NULL,
    "education" "text" DEFAULT ''::"text" NOT NULL,
    "certifications" "text" DEFAULT ''::"text",
    "experience_level" "text" DEFAULT ''::"text",
    "languages" "text"[] DEFAULT '{}'::"text"[],
    "tools_software" "text"[] DEFAULT '{}'::"text"[],
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "keywords" "text"[] DEFAULT '{}'::"text"[],
    "avatar_url" "text" DEFAULT ''::"text",
    "scoring_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE "public"."user_profiles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_profiles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."authorized_users"
    ADD CONSTRAINT "authorized_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."authorized_users"
    ADD CONSTRAINT "authorized_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employers"
    ADD CONSTRAINT "employers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."employers"
    ADD CONSTRAINT "employers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_scoring_embeddings"
    ADD CONSTRAINT "job_scoring_embeddings_pkey" PRIMARY KEY ("job_id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_scoring_embeddings"
    ADD CONSTRAINT "profile_scoring_embeddings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_cover_letters"
    ADD CONSTRAINT "user_cover_letters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_cvs"
    ADD CONSTRAINT "user_cvs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_job_evaluations"
    ADD CONSTRAINT "user_job_evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_job_statuses"
    ADD CONSTRAINT "user_job_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "authorized_users_invite_code_key" ON "public"."authorized_users" USING "btree" ("invite_code") WHERE ("invite_code" IS NOT NULL);



CREATE UNIQUE INDEX "authorized_users_user_id_key" ON "public"."authorized_users" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_jobs_company" ON "public"."jobs" USING "btree" ("company");



CREATE INDEX "idx_jobs_company_trgm" ON "public"."jobs" USING "gin" ("company" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_jobs_last_seen_at" ON "public"."jobs" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "idx_jobs_location" ON "public"."jobs" USING "btree" ("location");



CREATE INDEX "idx_jobs_salary_max_amount" ON "public"."jobs" USING "btree" ("salary_max_amount" DESC NULLS LAST);



CREATE INDEX "idx_jobs_title_trgm" ON "public"."jobs" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_user_cover_letters_user_id" ON "public"."user_cover_letters" USING "btree" ("user_id");



CREATE INDEX "idx_user_cvs_user_id" ON "public"."user_cvs" USING "btree" ("user_id");



CREATE INDEX "idx_user_job_evaluations_job_id" ON "public"."user_job_evaluations" USING "btree" ("job_id");



CREATE INDEX "idx_user_job_evaluations_user_relevance" ON "public"."user_job_evaluations" USING "btree" ("user_id", "relevance" DESC);



CREATE INDEX "idx_user_job_statuses_job_id" ON "public"."user_job_statuses" USING "btree" ("job_id");



CREATE UNIQUE INDEX "user_cover_letters_storage_path_key" ON "public"."user_cover_letters" USING "btree" ("storage_path") WHERE ("storage_path" IS NOT NULL);



CREATE UNIQUE INDEX "user_cvs_storage_path_key" ON "public"."user_cvs" USING "btree" ("storage_path") WHERE ("storage_path" IS NOT NULL);



CREATE UNIQUE INDEX "user_job_evaluations_user_id_job_key" ON "public"."user_job_evaluations" USING "btree" ("user_id", "job_id");



CREATE UNIQUE INDEX "user_job_statuses_user_id_job_key" ON "public"."user_job_statuses" USING "btree" ("user_id", "job_id");



CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "bind_existing_verified_account" BEFORE INSERT OR UPDATE OF "email" ON "public"."authorized_users" FOR EACH ROW EXECUTE FUNCTION "public"."bind_existing_verified_account"();



CREATE OR REPLACE TRIGGER "trg_check_user_cover_letter_limit" BEFORE INSERT ON "public"."user_cover_letters" FOR EACH ROW EXECUTE FUNCTION "public"."check_user_cover_letter_limit"();



CREATE OR REPLACE TRIGGER "trg_check_user_cv_limit" BEFORE INSERT ON "public"."user_cvs" FOR EACH ROW EXECUTE FUNCTION "public"."check_user_cv_limit"();



CREATE OR REPLACE TRIGGER "trg_jobs_normalize_salary" BEFORE INSERT OR UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_job_salary"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_cover_letters" BEFORE INSERT OR UPDATE ON "public"."user_cover_letters" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_cvs" BEFORE INSERT OR UPDATE ON "public"."user_cvs" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_job_evaluations" BEFORE INSERT OR UPDATE ON "public"."user_job_evaluations" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_job_statuses" BEFORE INSERT OR UPDATE ON "public"."user_job_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_profiles" BEFORE INSERT OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



ALTER TABLE ONLY "public"."authorized_users"
    ADD CONSTRAINT "authorized_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_scoring_embeddings"
    ADD CONSTRAINT "job_scoring_embeddings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_scoring_embeddings"
    ADD CONSTRAINT "profile_scoring_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cover_letters"
    ADD CONSTRAINT "user_cover_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cvs"
    ADD CONSTRAINT "user_cvs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_job_evaluations"
    ADD CONSTRAINT "user_job_evaluations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_job_evaluations"
    ADD CONSTRAINT "user_job_evaluations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_job_statuses"
    ADD CONSTRAINT "user_job_statuses_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_job_statuses"
    ADD CONSTRAINT "user_job_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authorized users can read employers" ON "public"."employers" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_authorized_user"() AS "is_authorized_user"));



CREATE POLICY "Authorized users can read jobs" ON "public"."jobs" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_authorized_user"() AS "is_authorized_user"));



CREATE POLICY "Authorized users can read sources" ON "public"."sources" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_authorized_user"() AS "is_authorized_user"));



CREATE POLICY "Users delete own cover letter" ON "public"."user_cover_letters" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users delete own cv" ON "public"."user_cvs" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users delete own evaluations" ON "public"."user_job_evaluations" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users delete own job statuses" ON "public"."user_job_statuses" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users delete own profile" ON "public"."user_profiles" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users insert own cover letter" ON "public"."user_cover_letters" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users insert own cv" ON "public"."user_cvs" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users insert own evaluations" ON "public"."user_job_evaluations" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users insert own profile" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users insert own statuses" ON "public"."user_job_statuses" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users read own authorization or invitations" ON "public"."authorized_users" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_authorized_user"() AS "is_authorized_user")));



CREATE POLICY "Users read own cover letter" ON "public"."user_cover_letters" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users read own cv" ON "public"."user_cvs" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users read own evaluations" ON "public"."user_job_evaluations" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users read own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users read own statuses" ON "public"."user_job_statuses" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users update own cover letter" ON "public"."user_cover_letters" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users update own cv" ON "public"."user_cvs" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users update own evaluations" ON "public"."user_job_evaluations" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users update own statuses" ON "public"."user_job_statuses" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."authorized_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_scoring_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_scoring_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cover_letters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cvs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_job_evaluations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_job_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."jobs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sources";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";









































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."bind_existing_verified_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bind_existing_verified_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bind_verified_invitation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bind_verified_invitation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_cover_letter_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_user_cover_letter_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_cv_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_user_cv_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_invitation"("target_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_invitation"("target_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invitation"("target_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_invitation"("invitation_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_invitation"("invitation_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_invitation"("invitation_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_job_scoring_work"("p_jobs" "jsonb", "p_profiles" "jsonb", "p_model_version" "text", "p_scoring_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_job_scoring_work"("p_jobs" "jsonb", "p_profiles" "jsonb", "p_model_version" "text", "p_scoring_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_jobs_page"("p_status" "text", "p_domain" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_jobs_page"("p_status" "text", "p_domain" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_jobs_page"("p_status" "text", "p_domain" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_overview_metrics"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_overview_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overview_metrics"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_authorized_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_authorized_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_authorized_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_job_salary"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_job_salary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_job_salary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."owns_document_object"("object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_document_object"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_document_object"("object_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_deleted_account_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_deleted_account_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_id_from_auth"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_id_from_auth"() TO "service_role";






























GRANT ALL ON TABLE "public"."authorized_users" TO "anon";
GRANT ALL ON TABLE "public"."authorized_users" TO "authenticated";
GRANT ALL ON TABLE "public"."authorized_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."authorized_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."authorized_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."authorized_users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."employers" TO "anon";
GRANT ALL ON TABLE "public"."employers" TO "authenticated";
GRANT ALL ON TABLE "public"."employers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."employers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."employers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."employers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."job_scoring_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."jobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."jobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."jobs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profile_scoring_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."sources" TO "anon";
GRANT ALL ON TABLE "public"."sources" TO "authenticated";
GRANT ALL ON TABLE "public"."sources" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sources_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sources_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sources_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_cover_letters" TO "anon";
GRANT ALL ON TABLE "public"."user_cover_letters" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cover_letters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_cover_letters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_cover_letters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_cover_letters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_cvs" TO "anon";
GRANT ALL ON TABLE "public"."user_cvs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cvs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_cvs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_cvs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_cvs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_job_evaluations" TO "anon";
GRANT ALL ON TABLE "public"."user_job_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_job_evaluations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_job_evaluations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_job_evaluations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_job_evaluations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_job_statuses" TO "anon";
GRANT ALL ON TABLE "public"."user_job_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_job_statuses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_job_statuses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_job_statuses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_job_statuses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_profiles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_profiles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_profiles_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































-- Auth and Storage policies.

CREATE OR REPLACE TRIGGER "bind_verified_invitation" AFTER INSERT OR UPDATE OF "email", "email_confirmed_at" ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."bind_verified_invitation"();



CREATE OR REPLACE TRIGGER "purge_deleted_account_access" BEFORE DELETE ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."purge_deleted_account_access"();



CREATE POLICY "Users can delete own avatar" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "Users can only delete own storage documents" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can only update own storage documents" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object"))) WITH CHECK ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can only upload own storage documents" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'user-documents'::"text") AND ("split_part"("name", '/'::"text", 1) = (( SELECT "auth"."uid"() AS "uid"))::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can only view own storage documents" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can read own avatar metadata" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "Users can update own avatar" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text"))) WITH CHECK ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "Users can upload own avatar" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));




-- Storage bucket rows and publication membership are data omitted by schema squash.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('user-documents', 'user-documents', false, 10485760, ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'
  ])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs, public.sources;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Explicit revokes override Supabase's inherited default grants on fresh installs.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_job_salary() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invitation(text), public.delete_invitation(bigint),
  public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer),
  public.get_overview_metrics(), public.is_authorized_user(),
  public.jobpulse_literal_search_pattern(text), public.owns_document_object(text)
TO authenticated;
REVOKE ALL ON public.job_scoring_embeddings, public.profile_scoring_embeddings FROM PUBLIC, anon, authenticated;
