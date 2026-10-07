-- JobPulse database baseline.
--
-- This single migration builds the complete schema in dependency order: extensions,
-- tables, sequences, indexes, constraints, RLS policies, functions, triggers, grants
-- and the customizations this project owns in the `auth` and `storage` schemas.
--
-- Two blocks are appended after the schema definition because a schema-only dump omits
-- them, and a fresh database (local reset and CI) requires both:
--   1. Explicit role privileges reconciled against the browser-access security contracts.
--   2. Bootstrap rows, Storage bucket rows and pg_cron schedules used at runtime.
--
-- Add new changes as forward migrations. Do not edit this baseline; generate a new
-- migration with `npm run db:migration <name>` (see docs/DATABASE_SCHEMA.md).




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


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."apply_job_location_verifications"("p_records" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE r jsonb; changed integer; updated integer:=0; conflicts integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' OR jsonb_array_length(p_records)>100 THEN
  RAISE EXCEPTION 'Expected at most 100 location records' USING ERRCODE='22023';
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  IF r->>'status' IS NULL OR r->>'status' NOT IN ('verified','remote','unresolved','ambiguous')
   OR r->>'provider' IS DISTINCT FROM 'Geoapify'
   OR r->>'source' IS DISTINCT FROM 'https://api.geoapify.com/v1/geocode/search'
   OR jsonb_typeof(r->'location') IS DISTINCT FROM 'string' OR length(r->>'location')>500
   OR r->>'checked_at' IS NULL THEN RAISE EXCEPTION 'Invalid location evidence' USING ERRCODE='22023'; END IF;
  PERFORM (r->>'checked_at')::timestamptz;
  IF r->>'status'='verified' AND (
    jsonb_typeof(r->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(r->'longitude') IS DISTINCT FROM 'number'
    OR NOT ((r->>'latitude')::numeric BETWEEN -90 AND 90) OR NOT ((r->>'longitude')::numeric BETWEEN -180 AND 180)
    OR r->>'precision' IS NULL OR r->>'precision' NOT IN ('building','street','postcode','city','district','county','state','country','amenity')
    OR jsonb_typeof(r->'confidence') IS DISTINCT FROM 'number' OR NOT ((r->>'confidence')::numeric BETWEEN 0.8 AND 1)
  ) THEN RAISE EXCEPTION 'Invalid verified location' USING ERRCODE='22023'; END IF;
  UPDATE public.jobs SET location_verification = r - 'id' - 'latitude' - 'longitude',
   latitude=CASE WHEN r->>'status'='verified' THEN (r->>'latitude')::double precision ELSE NULL END,
   longitude=CASE WHEN r->>'status'='verified' THEN (r->>'longitude')::double precision ELSE NULL END,
   coordinate_source=CASE WHEN r->>'status'='verified' THEN 'geocoded' ELSE NULL END
   WHERE id=(r->>'id')::bigint AND location=r->>'location';
  GET DIAGNOSTICS changed=ROW_COUNT;
  updated:=updated+changed; conflicts:=conflicts+(1-changed);
 END LOOP;
 RETURN jsonb_build_object('updated',updated,'conflicts',conflicts);
END $$;


ALTER FUNCTION "public"."apply_job_location_verifications"("p_records" "jsonb") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."clear_changed_job_location_verification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
 IF NEW.location IS DISTINCT FROM OLD.location THEN
  NEW.location_verification:=NULL;
  IF OLD.coordinate_source='geocoded' AND NEW.coordinate_source IS DISTINCT FROM 'posting' THEN
   NEW.latitude:=NULL; NEW.longitude:=NULL; NEW.coordinate_source:=NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."clear_changed_job_location_verification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_stale_jobs"("p_grace_days" integer DEFAULT 14, "p_limit" integer DEFAULT 10000) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_grace_days IS NULL OR p_grace_days < 1 OR p_grace_days > 365
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid sweep bounds' USING ERRCODE = '22023';
  END IF;
  RETURN 0;
END $$;


ALTER FUNCTION "public"."close_stale_jobs"("p_grace_days" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.user_profiles(user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_user_profile"() OWNER TO "postgres";


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
  existing_owner uuid;
BEGIN
  -- 1. Ensure caller is an active, authorized user
  IF caller_id IS NULL OR NOT (SELECT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Unauthorized: only active members can send invitations';
  END IF;

  -- 2. Validate email syntax
  IF clean_email IS NULL OR length(clean_email)>254 OR clean_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address format';
  END IF;

  -- Serialize quota checks and creation for the same issuer.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text || ':invitations',0));
  -- 3. Check existing invitation or user
  SELECT id, status, invite_code, invited_by INTO existing_id, existing_status, existing_code, existing_owner
  FROM public.authorized_users
  WHERE email = clean_email;

  IF existing_id IS NOT NULL THEN
    IF existing_owner IS DISTINCT FROM caller_id THEN
      RAISE EXCEPTION 'Invitation unavailable';
    END IF;
    IF existing_status = 'accepted' THEN
      RAISE EXCEPTION 'User with email % is already an active member', clean_email;
    ELSIF existing_status = 'pending' THEN
      -- Only the issuer may recover an existing pending link.
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

  IF (SELECT count(*) FROM public.authorized_users WHERE invited_by=caller_id AND status='pending')>=100 THEN
    RAISE EXCEPTION 'Pending invitation limit reached';
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
  WHERE id = invitation_id AND invited_by=caller_id;

  IF invite_row.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF invite_row.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot delete an active member account';
  END IF;

  -- Physically remove the pending invitation row
  DELETE FROM public.authorized_users
  WHERE id = invitation_id AND status = 'pending' AND invited_by=caller_id;

  RETURN json_build_object('success', true, 'id', invitation_id);
END;
$$;


ALTER FUNCTION "public"."delete_invitation"("invitation_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_candidate_scoring"("p_user_id" "uuid", "p_top_k" integer DEFAULT 1500) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE f text;
BEGIN
 SELECT md5(concat_ws(':',pe.content_hash,pe.model_version,
   (jsonb_build_object('headline',p.headline,'current_role',p.current_role,'summary',p.summary,
    'keywords',p.keywords,'tools',p.tools_software,'certifications',p.certifications,'education',p.education,
    'roles',p.target_roles,'locations',p.target_locations,'mode',p.work_mode,'salary',p.salary_min,
    'employment',p.employment,'authorization',p.work_authorization,'rules',coalesce(p.scoring_rules,'{}'::jsonb)-'weights'))::text)) INTO f
 FROM public.user_profiles p JOIN public.profile_scoring_embeddings pe ON pe.user_id=p.user_id WHERE p.user_id=p_user_id;
 IF f IS NULL OR EXISTS(SELECT 1 FROM public.candidate_scoring_work WHERE user_id=p_user_id AND needs_embedding) THEN
  INSERT INTO public.candidate_scoring_work(user_id,fingerprint,state,needs_embedding) VALUES(p_user_id,'','awaiting_embedding',true)
  ON CONFLICT(user_id) DO UPDATE SET state='awaiting_embedding',needs_embedding=true,fingerprint='',updated_at=clock_timestamp();
  RETURN;
 END IF;
 INSERT INTO public.candidate_scoring_work(user_id,fingerprint,top_k) VALUES(p_user_id,f,least(greatest(coalesce(p_top_k,1500),1),1500))
 ON CONFLICT(user_id) DO UPDATE SET
  fingerprint=EXCLUDED.fingerprint, desired_revision=public.candidate_scoring_work.desired_revision+1,
  state='pending',job_ids=NULL,cursor=0,attempts=0,retry_at=now(),last_error_code=NULL,top_k=EXCLUDED.top_k
 WHERE public.candidate_scoring_work.fingerprint IS DISTINCT FROM EXCLUDED.fingerprint
  OR public.candidate_scoring_work.top_k<>EXCLUDED.top_k OR public.candidate_scoring_work.state='failed';
END $$;


ALTER FUNCTION "public"."enqueue_candidate_scoring"("p_user_id" "uuid", "p_top_k" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_profile_scoring"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF TG_TABLE_NAME='user_profiles' AND TG_OP='UPDATE' THEN
  IF ROW(NEW.headline,NEW.current_role,NEW.summary,NEW.keywords,NEW.tools_software,NEW.languages,NEW.certifications,NEW.education)
    IS DISTINCT FROM ROW(OLD.headline,OLD.current_role,OLD.summary,OLD.keywords,OLD.tools_software,OLD.languages,OLD.certifications,OLD.education) THEN
   UPDATE public.candidate_scoring_work SET needs_embedding=true,state='awaiting_embedding',fingerprint='',updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
  END IF;
 ELSIF TG_TABLE_NAME='profile_scoring_embeddings' THEN
  UPDATE public.candidate_scoring_work SET needs_embedding=false WHERE user_id=NEW.user_id;
 END IF;
 PERFORM public.enqueue_candidate_scoring(NEW.user_id,coalesce((SELECT top_k FROM public.candidate_scoring_work WHERE user_id=NEW.user_id),1500));
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."enqueue_profile_scoring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fit_tier_for_score"("p_score" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT CASE WHEN p_score >= 75 THEN 'Strong Match' WHEN p_score >= 55 THEN 'Good Match'
    WHEN p_score >= 35 THEN 'Moderate Match' WHEN p_score >= 15 THEN 'Low Match' ELSE 'Mismatch' END;
$$;


ALTER FUNCTION "public"."fit_tier_for_score"("p_score" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_job_map"("p_status" "text" DEFAULT 'all'::"text", "p_sector" "text" DEFAULT 'all'::"text", "p_min_match" integer DEFAULT 0, "p_location" "text" DEFAULT 'all'::"text", "p_salary" "text" DEFAULT 'all'::"text", "p_search" "text" DEFAULT NULL::"text", "p_bounds" double precision[] DEFAULT ARRAY[('-180'::integer)::double precision, ('-90'::integer)::double precision, (180)::double precision, (90)::double precision], "p_zoom" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE v_effective_uid uuid; v_search_pattern text; v_grid double precision; result jsonb;
BEGIN
 IF NOT public.is_authorized_user() AND auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Access denied: user is not authorized'; END IF;
 v_effective_uid:=auth.uid();
 IF coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','saved','interested','not_interested','rejected')
  OR (coalesce(p_salary,'all') NOT IN ('all','disclosed') AND coalesce(p_salary,'all') !~ '^(?:[1-9]|[12][0-9]|30)0k$')
  OR length(coalesce(p_sector,''))>100 OR length(coalesce(p_search,''))>80 OR length(coalesce(p_location,''))>80
  OR p_bounds IS NULL OR array_ndims(p_bounds) IS DISTINCT FROM 1 OR array_lower(p_bounds,1) IS DISTINCT FROM 1
  OR array_position(p_bounds,NULL) IS NOT NULL OR array_length(p_bounds,1) IS DISTINCT FROM 4
  OR NOT (p_bounds[1] BETWEEN -180 AND 180 AND p_bounds[3] BETWEEN -180 AND 180
          AND p_bounds[2] BETWEEN -90 AND 90 AND p_bounds[4] BETWEEN -90 AND 90)
  OR p_bounds[2]>p_bounds[4] OR p_zoom IS NULL OR p_zoom NOT BETWEEN 0 AND 19 THEN
  RAISE EXCEPTION 'Invalid map filter or viewport' USING ERRCODE='22023'; END IF;
 v_grid:=360.0 / power(2,least(p_zoom+5,24));
 v_search_pattern:=public.jobpulse_literal_search_pattern(coalesce(p_search,''));
  WITH catalog_sectors AS MATERIALIZED (SELECT * FROM public.jobpulse_catalog_sectors()), user_evals AS (
    SELECT e.job_id,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights')
      ELSE e.relevance END AS relevance,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN public.fit_tier_for_score(
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights'))
      ELSE e.fit_tier END AS fit_tier,
      e.matched_skills, e.ai_analysis
    FROM public.user_job_evaluations e
    JOIN public.user_profiles p ON p.user_id=e.user_id
    WHERE v_effective_uid IS NOT NULL AND e.user_id = v_effective_uid
  ), user_stats AS (
    SELECT job_id, status, is_saved FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), combined AS (
    SELECT j.id, j.title, j.company, j.location, j.employment_type, j.salary_text,
      j.salary_min_amount, j.salary_max_amount, j.salary_currency, j.salary_period,
      j.url, j.source, j.employer_id, j.location_verification,
      CASE WHEN j.coordinate_source = 'geocoded' AND j.location_verification->>'status'='verified' AND j.location_verification->>'location'=j.location THEN j.latitude END AS latitude,
      CASE WHEN j.coordinate_source = 'geocoded' AND j.location_verification->>'status'='verified' AND j.location_verification->>'location'=j.location THEN j.longitude END AS longitude,
      coalesce(catalog_sector.sector,'Uncategorized') AS employer_sector,
      coalesce(catalog_sector.sector,'Uncategorized') AS sector,
      coalesce(nullif(trim(e.ai_analysis->>'role_sector'), ''), 'Uncategorized') AS role_sector,
      e.ai_analysis->>'seniority_level' AS seniority_level, j.last_seen_at, coalesce(e.relevance, 0) AS relevance,
      coalesce(e.fit_tier, 'Unassessed') AS fit_tier,
      coalesce(e.matched_skills, '[]'::jsonb) AS matched_skills,
      coalesce(s.status, 'new') AS status, coalesce(s.is_saved,false) AS is_saved
    FROM public.jobs j
    LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN catalog_sectors catalog_sector ON catalog_sector.employer_id = j.employer_id
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id WHERE j.closed_at IS NULL
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR (p_status IN ('saved','interested') AND c.is_saved) OR c.status = p_status)
      AND (p_sector IS NULL OR p_sector = 'all' OR c.employer_sector = p_sector OR
        (p_sector NOT IN ('Other','Uncategorized') AND EXISTS (
          SELECT 1 FROM public.employers legacy WHERE legacy.id=c.employer_id
          AND legacy.metadata_source IN ('curated','watchlist','verified') AND btrim(legacy.sector)=p_sector)))
      AND (p_min_match IS NULL OR p_min_match <= 0 OR c.relevance >= p_min_match)
      AND (p_search IS NULL OR trim(p_search) = '' OR c.title ILIKE v_search_pattern ESCAPE chr(92) OR c.company ILIKE v_search_pattern ESCAPE chr(92) OR c.location ILIKE v_search_pattern ESCAPE chr(92) OR c.matched_skills::text ILIKE v_search_pattern ESCAPE chr(92))
      AND (p_location IS NULL OR p_location = 'all' OR c.location ILIKE public.jobpulse_literal_search_pattern(p_location) ESCAPE chr(92))
      AND (p_salary IS NULL OR p_salary = 'all' OR
        (p_salary = 'disclosed' AND (c.salary_max_amount IS NOT NULL OR c.salary_min_amount IS NOT NULL)) OR
        (c.salary_currency = 'EUR' AND c.salary_period = 'annual' AND (
          coalesce(c.salary_max_amount, c.salary_min_amount) >=
          CASE WHEN p_salary ~ '^(?:[1-9]|[12][0-9]|30)0k$'
            THEN split_part(p_salary, 'k', 1)::integer * 1000 END)))
  ), office_jobs AS (
 SELECT c.*,o.latitude AS office_latitude,o.longitude AS office_longitude
 FROM filtered c
 JOIN public.employers emp ON emp.id=c.employer_id
 JOIN public.employer_office_lookups l ON l.employer_id=c.employer_id AND l.location=c.location
  AND l.employer_name=emp.name AND l.status='found' AND l.retry_after>now()
 JOIN LATERAL (
  SELECT min(e.latitude) AS latitude,min(e.longitude) AS longitude
  FROM public.employer_offices e WHERE e.employer_id=c.employer_id
   AND l.office_place_ids ? e.place_id AND e.checked_at>now()-interval '180 days'
  HAVING count(*)=1
 ) o ON true
 WHERE c.location_verification->>'status'='verified'
  AND c.location_verification->>'location'=c.location
  AND c.location_verification->>'precision' IN ('city','district')
 ), office_clusters AS (
 SELECT avg(office_latitude) AS latitude,avg(office_longitude) AS longitude,count(*) AS count,
  (array_agg(id ORDER BY relevance DESC,id))[1:5] AS job_ids,
  min(title) AS title,min(company) AS company,min(sector) AS sector,'company_office'::text AS precision
 FROM office_jobs WHERE office_latitude BETWEEN p_bounds[2] AND p_bounds[4]
  AND CASE WHEN p_bounds[1]<=p_bounds[3] THEN office_longitude BETWEEN p_bounds[1] AND p_bounds[3]
       ELSE office_longitude>=p_bounds[1] OR office_longitude<=p_bounds[3] END
 GROUP BY floor(office_latitude/v_grid),floor(office_longitude/v_grid)
 ), office_bounded AS (SELECT * FROM office_clusters ORDER BY count DESC,latitude,longitude LIMIT 2000), located AS (
 SELECT * FROM filtered WHERE latitude IS NOT NULL AND longitude IS NOT NULL
 ), viewport AS (
 SELECT * FROM located WHERE latitude BETWEEN p_bounds[2] AND p_bounds[4]
  AND CASE WHEN p_bounds[1]<=p_bounds[3] THEN longitude BETWEEN p_bounds[1] AND p_bounds[3]
       ELSE longitude>=p_bounds[1] OR longitude<=p_bounds[3] END
 ), clusters AS (
 SELECT avg(latitude) AS latitude,avg(longitude) AS longitude,count(*) AS count,
  (array_agg(id ORDER BY relevance DESC,id))[1:5] AS job_ids,
  min(title) AS title,min(company) AS company,min(sector) AS sector,
  CASE WHEN count(DISTINCT location_verification->>'precision')=1
    THEN min(location_verification->>'precision') ELSE 'mixed' END AS precision
 FROM viewport GROUP BY floor(latitude/v_grid),floor(longitude/v_grid)
 ), bounded AS (SELECT * FROM clusters ORDER BY count DESC,latitude,longitude LIMIT 2000)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),
  'mapped',(SELECT count(*) FROM located),'in_view',(SELECT count(*) FROM viewport),
  'truncated',(SELECT count(*) FROM clusters)>2000,
  'office_pins',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM office_bounded b),'[]'::jsonb),
  'office_truncated',(SELECT count(*) FROM office_clusters)>2000,
  'pins',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM bounded b),'[]'::jsonb)) INTO result;
 RETURN result;
END $_$;


ALTER FUNCTION "public"."get_job_map"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_bounds" double precision[], "p_zoom" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_jobs_page"("p_status" "text" DEFAULT 'all'::"text", "p_sector" "text" DEFAULT 'all'::"text", "p_min_match" integer DEFAULT 0, "p_location" "text" DEFAULT 'all'::"text", "p_salary" "text" DEFAULT 'all'::"text", "p_search" "text" DEFAULT NULL::"text", "p_sort_by" "text" DEFAULT 'match'::"text", "p_sort_dir" "text" DEFAULT 'desc'::"text", "p_limit" integer DEFAULT 40, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  v_caller_role text := auth.role();
  v_effective_uid uuid;
  v_total bigint;
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_search_pattern text;
BEGIN
  IF (coalesce(p_salary,'all') NOT IN ('all','disclosed') AND coalesce(p_salary,'all') !~ '^(?:[1-9]|[12][0-9]|30)0k$') OR
     coalesce(p_sort_by,'match') NOT IN ('match','date','salary','title','company','category','location') OR
     coalesce(p_sort_dir,'desc') NOT IN ('asc','desc') OR
     coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','saved','interested','not_interested','rejected') THEN
    RAISE EXCEPTION 'Invalid job filter' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_sector,'')) > 100 THEN
    RAISE EXCEPTION 'Sector filters must be at most 100 characters' USING ERRCODE='22023';
  END IF;
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

  WITH catalog_sectors AS MATERIALIZED (SELECT * FROM public.jobpulse_catalog_sectors()), user_evals AS (
    SELECT e.job_id,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights')
      ELSE e.relevance END AS relevance,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN public.fit_tier_for_score(
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights'))
      ELSE e.fit_tier END AS fit_tier,
      e.matched_skills, e.ai_analysis
    FROM public.user_job_evaluations e
    JOIN public.user_profiles p ON p.user_id=e.user_id
    WHERE v_effective_uid IS NOT NULL AND e.user_id = v_effective_uid
  ), user_stats AS (
    SELECT job_id, status, is_saved FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), combined AS (
    SELECT j.id, j.title, j.company, j.location, j.employment_type, j.salary_text,
      j.salary_min_amount, j.salary_max_amount, j.salary_currency, j.salary_period,
      j.url, j.source, j.employer_id,
      CASE WHEN j.coordinate_source = 'posting' THEN j.latitude END AS latitude,
      CASE WHEN j.coordinate_source = 'posting' THEN j.longitude END AS longitude,
      coalesce(catalog_sector.sector,'Uncategorized') AS employer_sector,
      coalesce(catalog_sector.sector,'Uncategorized') AS sector,
      coalesce(nullif(trim(e.ai_analysis->>'role_sector'), ''), 'Uncategorized') AS role_sector,
      e.ai_analysis->>'seniority_level' AS seniority_level, j.last_seen_at, coalesce(e.relevance, 0) AS relevance,
      coalesce(e.fit_tier, 'Unassessed') AS fit_tier,
      coalesce(e.matched_skills, '[]'::jsonb) AS matched_skills,
      coalesce(s.status, 'new') AS status, coalesce(s.is_saved,false) AS is_saved
    FROM public.jobs j
    LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN catalog_sectors catalog_sector ON catalog_sector.employer_id = j.employer_id
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id WHERE j.closed_at IS NULL
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR (p_status IN ('saved','interested') AND c.is_saved) OR c.status = p_status)
      AND (p_sector IS NULL OR p_sector = 'all' OR c.employer_sector = p_sector OR
        (p_sector NOT IN ('Other','Uncategorized') AND EXISTS (
          SELECT 1 FROM public.employers legacy WHERE legacy.id=c.employer_id
          AND legacy.metadata_source IN ('curated','watchlist','verified') AND btrim(legacy.sector)=p_sector)))
      AND (p_min_match IS NULL OR p_min_match <= 0 OR c.relevance >= p_min_match)
      AND (p_search IS NULL OR trim(p_search) = '' OR c.title ILIKE v_search_pattern ESCAPE chr(92) OR c.company ILIKE v_search_pattern ESCAPE chr(92) OR c.location ILIKE v_search_pattern ESCAPE chr(92) OR c.matched_skills::text ILIKE v_search_pattern ESCAPE chr(92))
      AND (p_location IS NULL OR p_location = 'all' OR c.location ILIKE public.jobpulse_literal_search_pattern(p_location) ESCAPE chr(92))
      AND (p_salary IS NULL OR p_salary = 'all' OR
        (p_salary = 'disclosed' AND (c.salary_max_amount IS NOT NULL OR c.salary_min_amount IS NOT NULL)) OR
        (c.salary_currency = 'EUR' AND c.salary_period = 'annual' AND (
          coalesce(c.salary_max_amount, c.salary_min_amount) >=
          CASE WHEN p_salary ~ '^(?:[1-9]|[12][0-9]|30)0k$'
            THEN split_part(p_salary, 'k', 1)::integer * 1000 END)))
  ), counted AS (
    SELECT count(*) AS total FROM filtered
  ), paginated AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort_by = 'match' AND p_sort_dir = 'asc' THEN relevance END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'match' AND (p_sort_dir = 'desc' OR p_sort_dir IS NULL) THEN relevance END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'date' AND p_sort_dir = 'asc' THEN last_seen_at END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'date' AND (p_sort_dir = 'desc' OR p_sort_dir IS NULL) THEN last_seen_at END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'location' AND p_sort_dir = 'desc' THEN location END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'location' AND p_sort_dir <> 'desc' THEN location END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'category' AND p_sort_dir = 'desc' THEN employer_sector END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'category' AND p_sort_dir <> 'desc' THEN employer_sector END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'salary' AND p_sort_dir = 'asc' THEN coalesce(salary_min_amount, salary_max_amount) END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'salary' AND (p_sort_dir = 'desc' OR p_sort_dir IS NULL) THEN coalesce(salary_max_amount, salary_min_amount) END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'title' AND p_sort_dir = 'asc' THEN title END ASC,
      CASE WHEN p_sort_by = 'title' AND p_sort_dir = 'desc' THEN title END DESC,
      CASE WHEN p_sort_by = 'company' AND p_sort_dir = 'asc' THEN company END ASC,
      CASE WHEN p_sort_by = 'company' AND p_sort_dir = 'desc' THEN company END DESC,
      relevance DESC NULLS LAST, last_seen_at DESC NULLS LAST, id DESC
    LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT (SELECT total FROM counted),
    coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM paginated r), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', floor(greatest(coalesce(p_offset, 0), 0) / v_limit) + 1,
    'pageSize', v_limit
  );
END;
$_$;


ALTER FUNCTION "public"."get_jobs_page"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


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

  SELECT count(*) INTO v_total FROM public.jobs WHERE closed_at IS NULL;
  SELECT job_count, locations, sectors INTO v_stats_count, v_locations, v_sectors
    FROM public.catalog_stats WHERE id AND is_valid;
  IF v_stats_count IS DISTINCT FROM v_total OR v_locations IS NULL OR v_sectors IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('loc', location, 'count', cnt) ORDER BY cnt DESC, location), '[]'::jsonb)
      INTO v_locations
      FROM (SELECT location, count(*) AS cnt FROM public.jobs
            WHERE closed_at IS NULL AND trim(coalesce(location, '')) <> ''
            GROUP BY location ORDER BY cnt DESC, location LIMIT 200) l;
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', employer_sector, 'value', cnt, 'avgMatch', 0)
        ORDER BY CASE employer_sector WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, cnt DESC, employer_sector), '[]'::jsonb)
      INTO v_sectors
      FROM (SELECT coalesce(cs.sector, 'Uncategorized') AS employer_sector, count(*) AS cnt
            FROM public.jobs j
            LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id
            WHERE j.closed_at IS NULL GROUP BY 1) s;
  END IF;

  WITH evals AS (
    SELECT e.job_id,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights')
      ELSE e.relevance END AS relevance,
      coalesce(nullif(trim(e.ai_analysis->>'role_domain'), ''), 'Uncategorized') AS role_domain,
      CASE WHEN jsonb_typeof(e.matched_skills) = 'array' THEN e.matched_skills ELSE '[]'::jsonb END AS matched_skills
    FROM public.user_job_evaluations e
    JOIN public.jobs j ON j.id = e.job_id AND j.closed_at IS NULL
    JOIN public.user_profiles p ON p.user_id = e.user_id
    WHERE v_effective_uid IS NOT NULL AND e.user_id = v_effective_uid
  ),
  tracked AS (
    SELECT s.status, s.is_saved, s.job_id
    FROM public.user_job_statuses s
    JOIN public.jobs j ON j.id = s.job_id AND j.closed_at IS NULL
    WHERE v_effective_uid IS NOT NULL AND s.user_id = v_effective_uid
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM evals) AS eval_count,
      (SELECT count(*) FROM evals WHERE relevance IS NOT NULL) AS evaluated,
      (SELECT count(*) FROM tracked WHERE status <> 'new') AS tracked
  ),
  status_counts AS (
    SELECT s.status, count(*) AS cnt, coalesce(round(avg(ev.relevance)), 0) AS avg_match
    FROM tracked s
    LEFT JOIN evals ev ON ev.job_id = s.job_id
    GROUP BY s.status
  ),
  saved_stats AS (
    SELECT count(*) FILTER (WHERE s.is_saved) AS saved,
           coalesce(round(avg(ev.relevance) FILTER (WHERE s.is_saved AND ev.relevance IS NOT NULL)), 0) AS saved_avg
    FROM tracked s
    LEFT JOIN evals ev ON ev.job_id = s.job_id
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
    WHERE ev.relevance IS NOT NULL AND j.closed_at IS NULL
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
      || jsonb_build_object('new', (SELECT coalesce(round(avg(ev.relevance)), 0)
      FROM evals ev LEFT JOIN tracked s ON s.job_id = ev.job_id
      WHERE coalesce(s.status, 'new') = 'new' AND ev.relevance IS NOT NULL))
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


ALTER FUNCTION "public"."get_overview_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profile_embedding_state"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 SELECT CASE WHEN public.is_authorized_user() THEN (
  SELECT jsonb_build_object('content_hash',pe.content_hash,'model_version',pe.model_version,
   'scoring_state',CASE WHEN q.completed_catalog_generation<g.generation AND q.state='complete' THEN 'pending' ELSE coalesce(q.state,'pending') END,
   'desired_revision',coalesce(q.desired_revision,0),'completed_revision',coalesce(q.completed_revision,0),
   'completed_jobs',coalesce(q.cursor,0),'total_jobs',coalesce(cardinality(q.job_ids),0),
   'updated_at',q.updated_at,'error_code',q.last_error_code)
  FROM public.user_profiles p LEFT JOIN public.profile_scoring_embeddings pe ON pe.user_id=p.user_id
  LEFT JOIN public.candidate_scoring_work q ON q.user_id=p.user_id
  CROSS JOIN public.scoring_catalog_generation g WHERE p.user_id=auth.uid() AND g.id
 ) ELSE NULL END
$$;


ALTER FUNCTION "public"."get_profile_embedding_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invalidate_catalog_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.catalog_stats SET is_valid = false WHERE id;
  RETURN NULL;
END $$;


ALTER FUNCTION "public"."invalidate_catalog_stats"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."jobpulse_catalog_sectors"() RETURNS TABLE("employer_id" bigint, "sector" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  WITH employer_groups AS MATERIALIZED (
    SELECT e.id, CASE WHEN e.metadata_source IN ('curated','watchlist','verified')
      THEN public.jobpulse_sector_group(e.sector) ELSE 'Uncategorized' END AS sector
    FROM public.employers e
  ), top_sectors AS (
    SELECT g.sector FROM public.jobs j
    JOIN employer_groups g ON g.id=j.employer_id
    WHERE g.sector NOT IN ('Other','Uncategorized')
    GROUP BY g.sector ORDER BY count(*) DESC, g.sector COLLATE "C" LIMIT 20
  )
  SELECT g.id, CASE WHEN g.sector='Uncategorized' THEN g.sector
    WHEN t.sector IS NOT NULL THEN g.sector ELSE 'Other' END
  FROM employer_groups g LEFT JOIN top_sectors t ON t.sector=g.sector;
$$;


ALTER FUNCTION "public"."jobpulse_catalog_sectors"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobpulse_has_literal_skill"("p_text" "text", "p_skill" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
DECLARE
 haystack text := lower(p_text);
 needle text := lower(btrim(p_skill));
 offset_pos integer := 1;
 hit integer;
 last_pos integer;
BEGIN
 IF length(needle) NOT BETWEEN 2 AND 50 THEN RETURN false; END IF;
 LOOP
  hit := strpos(substr(haystack,offset_pos),needle);
  IF hit=0 THEN RETURN false; END IF;
  hit := hit+offset_pos-1;
  last_pos := hit+length(needle);
  IF (hit=1 OR substr(haystack,hit-1,1) !~ '[[:alnum:]_]')
    AND (last_pos>length(haystack) OR substr(haystack,last_pos,1) !~ '[[:alnum:]_]') THEN
   RETURN true;
  END IF;
  offset_pos := hit+1;
 END LOOP;
END $$;


ALTER FUNCTION "public"."jobpulse_has_literal_skill"("p_text" "text", "p_skill" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT '%' || replace(replace(replace(trim(input), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
$$;


ALTER FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobpulse_sector_group"("p_sector" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  SELECT CASE
    WHEN s = '' OR s IN ('uncategorized','unclassified / miscellaneous','general','unknown') THEN 'Uncategorized'
    WHEN s ~ 'community employment' THEN 'Community Employment & Training'
    -- Recruiters stay recruiters even when their clients work in healthcare or IT.
    WHEN s ~ 'recruit|staffing|human resources|^hr[ ,&]|talent|workforce' THEN 'Recruitment & Staffing'
    WHEN s ~ 'public sector|public service|government|regulatory' THEN 'Public Sector & Government'
    WHEN s ~ 'pharma|biotech|biopharma|life science|clinical research' THEN 'Pharmaceuticals & Life Sciences'
    WHEN s ~ 'medical device|medical technology|medtech' THEN 'Medical Devices'
    WHEN s ~ 'insurance|risk advisory' THEN 'Insurance'
    WHEN s ~ 'health|nursing|home care|social care|eldercare|rehabilitation|disability' THEN 'Healthcare & Social Care'
    WHEN s ~ 'education|childcare|early childhood|edtech|learning|training|higher ed' THEN 'Education & Training'
    WHEN s ~ 'cybersecurity|security workflow|identity|access management|vulnerability|data protection' THEN 'Cybersecurity'
    WHEN s ~ 'fintech|financial|banking|payment|investment|fund services|crypto|credit rating' THEN 'Financial Services'
    WHEN s ~ 'telecommunication' THEN 'Telecommunications'
    WHEN s ~ 'software|saas|cloud|artificial intelligence|^ai |data|platform|semiconductor|hardware|electronic design|automation|networking|crm|observability|work management|connected workspace|email delivery|audio tech|feature management|digital signature|communications technology|marketing technology' THEN 'Technology & Software'
    WHEN s ~ 'aviation|aerospace|aircraft' THEN 'Aviation & Aerospace'
    WHEN s ~ 'automotive|vehicle|motor trade' THEN 'Automotive'
    WHEN s ~ 'energy|utilities|electricity|power generation|natural gas|cleantech' THEN 'Energy & Utilities'
    WHEN s ~ 'agriculture|farming|agribusiness|horticulture|animal|veterinary|pet care' THEN 'Agriculture & Animal Care'
    WHEN s ~ 'food|beverage|nutrition|dairy' AND s !~ 'hospitality|catering|restaurant|food service' THEN 'Food & Beverage'
    WHEN s ~ 'retail|commerce|consumer goods|fmcg|cosmetics|wholesale' THEN 'Retail & E-commerce'
    WHEN s ~ 'hospitality|hotel|tourism|travel|restaurant|catering|food service|accommodation' THEN 'Hospitality & Tourism'
    WHEN s ~ 'logistics|transport|freight|supply chain|distribution|postal' THEN 'Transport & Logistics'
    WHEN s ~ 'real estate|property' THEN 'Real Estate'
    WHEN s ~ 'facilit|workplace|business support|consumer services|personal care|equipment hire' THEN 'Facilities & Support Services'
    WHEN s ~ 'construction|civil|structural|building|architecture|engineering|water|wastewater' THEN 'Construction & Engineering'
    WHEN s ~ 'manufactur|industrial|machinery|fabrication|materials|mining|metal|printing|packaging' THEN 'Manufacturing & Industry'
    WHEN s ~ 'environment|waste|recycling' THEN 'Environmental Services'
    WHEN s ~ 'non-profit|nonprofit|non profit|community|social services|humanitarian|religious|charit|advocacy|volunteering' THEN 'Non-Profit & Community'
    WHEN s ~ 'media|entertainment|gaming|games|esports|film|ticketing|culture|heritage|events|sports|fitness' THEN 'Media, Culture & Leisure'
    WHEN s ~ 'professional|consult|accounting|legal|advisory|marketing|advertising|branding|research' THEN 'Professional Services'
    WHEN s ~ 'technology|^it ' THEN 'Technology & Software'
    ELSE 'Other'
  END FROM (SELECT lower(btrim(coalesce(p_sector,''))) AS s) normalized;
$$;


ALTER FUNCTION "public"."jobpulse_sector_group"("p_sector" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_duplicate_catalog_jobs"("p_keeper_id" bigint, "p_duplicate_ids" bigint[], "p_dedupe_key" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE deleted_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_keeper_id = ANY(p_duplicate_ids) OR cardinality(p_duplicate_ids) > 100
    OR p_dedupe_key IS NULL OR length(p_dedupe_key) > 500 THEN
    RAISE EXCEPTION 'Invalid duplicate merge request';
  END IF;
  -- A conflicting tracked state leaves both jobs intact for manual resolution.
  IF EXISTS (
    SELECT 1 FROM public.user_job_statuses a JOIN public.user_job_statuses b
      ON a.user_id=b.user_id AND a.job_id=p_keeper_id AND b.job_id=ANY(p_duplicate_ids)
    WHERE a.status IS DISTINCT FROM b.status
  ) OR EXISTS (
    SELECT 1 FROM public.user_job_statuses a JOIN public.user_job_statuses b
      ON a.user_id=b.user_id AND a.job_id=ANY(p_duplicate_ids) AND b.job_id=ANY(p_duplicate_ids)
      AND a.job_id <> b.job_id AND a.status IS DISTINCT FROM b.status
  ) THEN RETURN 0; END IF;
  INSERT INTO public.user_job_statuses(user_id,job_id,status,updated_at,is_saved)
  SELECT user_id,p_keeper_id,status,max(updated_at),bool_or(is_saved) FROM public.user_job_statuses
  WHERE job_id=ANY(p_duplicate_ids) GROUP BY user_id,status
  ON CONFLICT (user_id,job_id) DO UPDATE SET is_saved=public.user_job_statuses.is_saved OR excluded.is_saved;
  INSERT INTO public.user_job_evaluations(user_id,job_id,relevance,fit_tier,matched_skills,
    ai_analysis,calculated_at,scoring_job_hash,scoring_profile_hash,scoring_version)
  SELECT user_id,p_keeper_id,relevance,fit_tier,matched_skills,ai_analysis,calculated_at,
    scoring_job_hash,scoring_profile_hash,scoring_version
  FROM public.user_job_evaluations WHERE job_id=ANY(p_duplicate_ids)
  ON CONFLICT (user_id,job_id) DO NOTHING;
  DELETE FROM public.jobs WHERE id=ANY(p_duplicate_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  UPDATE public.jobs SET dedupe_key=p_dedupe_key WHERE id=p_keeper_id;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."merge_duplicate_catalog_jobs"("p_keeper_id" bigint, "p_duplicate_ids" bigint[], "p_dedupe_key" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."normalize_saved_job_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
 IF NEW.status='interested' THEN NEW.status:='new'; NEW.is_saved:=true; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."normalize_saved_job_status"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."pending_employer_office_lookups"("p_limit" integer DEFAULT 25) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid lookup limit' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
  SELECT e.id AS employer_id,e.name,e.website,j.location
  FROM public.jobs j JOIN public.employers e ON e.id=j.employer_id
  LEFT JOIN public.employer_office_lookups l ON l.employer_id=e.id AND l.location=j.location
  WHERE length(trim(j.location)) BETWEEN 1 AND 500
   AND (l.employer_id IS NULL OR l.employer_name IS DISTINCT FROM e.name OR l.retry_after<=now())
  GROUP BY e.id,e.name,e.website,j.location
  ORDER BY min(l.retry_after) NULLS FIRST,e.id,j.location LIMIT p_limit
 ) r),'[]'::jsonb);
END $$;


ALTER FUNCTION "public"."pending_employer_office_lookups"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_candidate_scoring"("p_batch_size" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE w public.candidate_scoring_work%ROWTYPE; pe public.profile_scoring_embeddings%ROWTYPE;
 generation bigint; candidate record; processed integer:=0; ids bigint[]; end_cursor integer; err text;
BEGIN
 SELECT g.generation INTO generation FROM public.scoring_catalog_generation g WHERE id;
 SELECT q.* INTO w FROM public.candidate_scoring_work q
 JOIN public.authorized_users a ON a.user_id=q.user_id AND a.status='accepted'
 WHERE q.state<>'awaiting_embedding' AND q.retry_at<=now() AND (q.state IN ('pending','running','failed') OR q.completed_catalog_generation<generation)
 ORDER BY q.updated_at,q.user_id FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF w.user_id IS NULL THEN RETURN 0; END IF;
 BEGIN
  SELECT * INTO pe FROM public.profile_scoring_embeddings WHERE user_id=w.user_id;
  IF pe.user_id IS NULL THEN DELETE FROM public.candidate_scoring_work WHERE user_id=w.user_id; RETURN 0; END IF;
  IF w.job_ids IS NULL OR w.state='complete' THEN
   -- A materialized distance list forces exact ranking. HNSW ef_search cannot guarantee K=1500.
   WITH distances AS MATERIALIZED (
    SELECT job_id,embedding OPERATOR(extensions.<=>) pe.embedding AS distance
    FROM public.job_scoring_embeddings WHERE model_version=pe.model_version
   ), shortlist AS (SELECT job_id,distance FROM distances ORDER BY distance,job_id LIMIT w.top_k)
   SELECT coalesce(array_agg(job_id ORDER BY distance,job_id),'{}'::bigint[]) INTO ids FROM shortlist;
   w.shortlist_ids:=ids;
   -- Catalog refreshes score only changed/new facts. Profile rule changes recompute the shortlist.
   SELECT coalesce(array_agg(j.job_id ORDER BY j.job_id),'{}'::bigint[]) INTO w.job_ids
   FROM public.job_scoring_embeddings j LEFT JOIN public.user_job_evaluations e ON e.job_id=j.job_id AND e.user_id=w.user_id
   WHERE j.job_id=ANY(ids) AND (w.completed_fingerprint IS DISTINCT FROM w.fingerprint
    OR e.job_id IS NULL OR e.scoring_version IS DISTINCT FROM 'native-sql-v2'
    OR e.scoring_job_hash IS DISTINCT FROM j.content_hash OR e.scoring_profile_hash IS DISTINCT FROM pe.content_hash);
   w.cursor:=0; w.catalog_generation:=generation;
  END IF;
  end_cursor:=least(cardinality(w.job_ids),w.cursor+least(greatest(coalesce(p_batch_size,100),1),100));
  FOR candidate IN SELECT j.job_id,(1-(j.embedding OPERATOR(extensions.<=>) pe.embedding))::real AS similarity
   FROM unnest(w.job_ids[w.cursor+1:end_cursor]) selected(job_id)
   JOIN public.job_scoring_embeddings j ON j.job_id=selected.job_id AND j.model_version=pe.model_version
  LOOP PERFORM public.score_job_for_user(w.user_id,candidate.job_id,candidate.similarity); processed:=processed+1; END LOOP;
  IF end_cursor=cardinality(w.job_ids) THEN
   DELETE FROM public.user_job_evaluations e WHERE e.user_id=w.user_id AND e.scoring_version IN ('native-sql-v1','native-sql-v2')
    AND NOT(e.job_id=ANY(w.shortlist_ids));
  END IF;
  UPDATE public.candidate_scoring_work SET job_ids=w.job_ids,shortlist_ids=w.shortlist_ids,cursor=end_cursor,catalog_generation=w.catalog_generation,
   state=CASE WHEN end_cursor=cardinality(w.job_ids) THEN 'complete' ELSE 'running' END,
   completed_fingerprint=CASE WHEN end_cursor=cardinality(w.job_ids) THEN w.fingerprint ELSE completed_fingerprint END,
   completed_revision=CASE WHEN end_cursor=cardinality(w.job_ids) THEN desired_revision ELSE completed_revision END,
   completed_catalog_generation=CASE WHEN end_cursor=cardinality(w.job_ids) THEN w.catalog_generation ELSE completed_catalog_generation END,
   attempts=0,last_error_code=NULL,updated_at=clock_timestamp(),retry_at=now() WHERE user_id=w.user_id;
 EXCEPTION WHEN OTHERS OR query_canceled THEN
  GET STACKED DIAGNOSTICS err=RETURNED_SQLSTATE;
  UPDATE public.candidate_scoring_work SET state='failed',attempts=attempts+1,last_error_code=err,
   updated_at=clock_timestamp(),retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)) WHERE user_id=w.user_id;
  RETURN 0;
 END;
 RETURN processed;
END $$;


ALTER FUNCTION "public"."process_candidate_scoring"("p_batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_candidate_scoring_queue"("p_max_slices" integer DEFAULT 50) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE started timestamptz:=clock_timestamp(); processed integer:=0;
BEGIN
 FOR i IN 1..least(greatest(coalesce(p_max_slices,50),1),50) LOOP
  EXIT WHEN clock_timestamp()-started>=interval '5 seconds';
  EXIT WHEN NOT EXISTS (
   SELECT 1 FROM public.candidate_scoring_work q
   JOIN public.authorized_users a ON a.user_id=q.user_id AND a.status='accepted'
   CROSS JOIN public.scoring_catalog_generation g
   WHERE g.id AND q.state<>'awaiting_embedding' AND q.retry_at<=now()
    AND (q.state IN ('pending','running','failed') OR q.completed_catalog_generation<g.generation)
  );
  processed:=processed+public.process_candidate_scoring(100);
 END LOOP;
 RETURN processed;
END $$;


ALTER FUNCTION "public"."process_candidate_scoring_queue"("p_max_slices" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_stale_catalog_jobs"("p_retention_days" integer DEFAULT 3) RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ SELECT 0 $$;


ALTER FUNCTION "public"."prune_stale_catalog_jobs"("p_retention_days" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."record_board_outcome"("p_board_id" bigint, "p_success" boolean, "p_ingested" integer DEFAULT 0, "p_error" "text" DEFAULT NULL::"text", "p_found" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_board_id IS NULL OR p_success IS NULL THEN
    RAISE EXCEPTION 'Invalid board outcome' USING ERRCODE = '22023';
  END IF;

  UPDATE public.boards SET
    last_crawled_at = now(),
    updated_at = now(),
    last_error = CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error, ''), 1000) END,
    last_ingested_count = CASE WHEN p_success THEN greatest(coalesce(p_ingested, 0), 0) ELSE last_ingested_count END,
    consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
    last_verified_at = CASE WHEN p_success THEN now() ELSE last_verified_at END,
    status = CASE WHEN p_success AND status = 'pending' THEN 'active' ELSE status END,
    cooldown_until = CASE
      WHEN p_success AND coalesce(p_found, p_ingested) > 0 THEN NULL
      WHEN p_success THEN now() + interval '7 days'  -- reachable but no Irish roles: weekly re-check
      WHEN consecutive_failures + 1 >= 3
        THEN now() + make_interval(hours => least(24, (6 * power(2, least(consecutive_failures + 1 - 3, 8)))::integer))
      ELSE NULL
    END
  WHERE id = p_board_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown board %', p_board_id USING ERRCODE = 'P0002';
  END IF;
END $$;


ALTER FUNCTION "public"."record_board_outcome"("p_board_id" bigint, "p_success" boolean, "p_ingested" integer, "p_error" "text", "p_found" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_catalog_stats"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  -- Serialize refresh with invalidation before taking the computation snapshot.
  PERFORM 1 FROM public.catalog_stats WHERE id FOR UPDATE;
  UPDATE public.catalog_stats SET
    job_count = (SELECT count(*) FROM public.jobs WHERE closed_at IS NULL),
    locations = (
      SELECT coalesce(jsonb_agg(jsonb_build_object('loc', location, 'count', cnt) ORDER BY cnt DESC, location), '[]'::jsonb)
      FROM (
        SELECT location, count(*) AS cnt FROM public.jobs
        WHERE closed_at IS NULL AND trim(coalesce(location, '')) <> ''
        GROUP BY location ORDER BY cnt DESC, location LIMIT 200
      ) l
    ),
    sectors = (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', employer_sector, 'value', cnt, 'avgMatch', 0)
        ORDER BY CASE employer_sector WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, cnt DESC, employer_sector), '[]'::jsonb)
      FROM (
        SELECT coalesce(cs.sector, 'Uncategorized') AS employer_sector, count(*) AS cnt
        FROM public.jobs j
        LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id
        WHERE j.closed_at IS NULL
        GROUP BY 1
      ) s
    ),
    computed_at = now(),
    is_valid = true
  WHERE id;
END $$;


ALTER FUNCTION "public"."refresh_catalog_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rescore_user"("p_user_id" "uuid", "p_top_k" integer DEFAULT 1500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND
  (auth.uid() IS DISTINCT FROM p_user_id OR NOT public.is_authorized_user()) THEN RAISE EXCEPTION 'Access denied'; END IF;
 PERFORM public.enqueue_candidate_scoring(p_user_id,p_top_k);
 RETURN 0;
END $$;


ALTER FUNCTION "public"."rescore_user"("p_user_id" "uuid", "p_top_k" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_employer_office_lookup"("p_record" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE o jsonb; eid bigint; outcome text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 eid:=(p_record->>'employer_id')::bigint; outcome:=p_record->>'status';
 IF jsonb_typeof(p_record) IS DISTINCT FROM 'object' OR outcome IS NULL
  OR outcome NOT IN ('found','unresolved','ambiguous','remote','provider_failed')
  OR jsonb_typeof(p_record->'offices') IS DISTINCT FROM 'array' OR jsonb_array_length(p_record->'offices')>20
  OR length(coalesce(p_record->>'location','')) NOT BETWEEN 1 AND 500
  OR (outcome<>'found' AND jsonb_array_length(p_record->'offices')<>0)
  OR (outcome='found' AND jsonb_array_length(p_record->'offices')=0)
 THEN RAISE EXCEPTION 'Invalid office lookup' USING ERRCODE='22023'; END IF;
 -- Lock identity while saving: a renamed or unlinked company cannot inherit a stale result.
 PERFORM 1 FROM public.employers e WHERE e.id=eid AND e.name=p_record->>'name' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.jobs WHERE employer_id=eid AND location=p_record->>'location') THEN RETURN false; END IF;
 FOR o IN SELECT value FROM jsonb_array_elements(p_record->'offices') LOOP
  IF length(coalesce(o->>'place_id','')) NOT BETWEEN 1 AND 500 OR length(coalesce(o->>'address','')) NOT BETWEEN 1 AND 1000
   OR length(coalesce(o->>'name','')) NOT BETWEEN 1 AND 500
   OR jsonb_typeof(o->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(o->'longitude') IS DISTINCT FROM 'number'
   OR NOT ((o->>'latitude')::numeric BETWEEN -90 AND 90) OR NOT ((o->>'longitude')::numeric BETWEEN -180 AND 180)
   OR jsonb_typeof(o->'categories') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'Invalid company place' USING ERRCODE='22023'; END IF;
  INSERT INTO public.employer_offices(employer_id,place_id,name,address,city,country_code,latitude,longitude,website,website_domain,categories)
  VALUES(eid,o->>'place_id',o->>'name',o->>'address',o->>'city',o->>'country_code',(o->>'latitude')::float8,(o->>'longitude')::float8,o->>'website',o->>'website_domain',o->'categories')
  ON CONFLICT (employer_id,place_id) DO UPDATE SET
   address=excluded.address,city=excluded.city,country_code=excluded.country_code,
   latitude=excluded.latitude,longitude=excluded.longitude,
   website=coalesce(excluded.website,public.employer_offices.website),
   website_domain=coalesce(excluded.website_domain,public.employer_offices.website_domain),
   categories=excluded.categories,checked_at=now();
 END LOOP;
 INSERT INTO public.employer_office_lookups(employer_id,employer_name,location,status,office_place_ids,retry_after)
 VALUES(eid,p_record->>'name',p_record->>'location',outcome,
  coalesce((SELECT jsonb_agg(value->>'place_id') FROM jsonb_array_elements(p_record->'offices')),'[]'::jsonb),
  now()+CASE outcome WHEN 'found' THEN interval '180 days' WHEN 'provider_failed' THEN interval '1 day' ELSE interval '30 days' END)
 ON CONFLICT (employer_id,location) DO UPDATE SET employer_name=excluded.employer_name,status=excluded.status,office_place_ids=excluded.office_place_ids,checked_at=now(),retry_after=excluded.retry_after;
 RETURN true;
END $$;


ALTER FUNCTION "public"."save_employer_office_lookup"("p_record" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_profile_embedding"("p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
BEGIN
  IF NOT public.is_authorized_user() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_embedding IS NULL OR extensions.vector_dims(p_embedding)<>384 OR extensions.vector_norm(p_embedding)=0
    OR p_content_hash IS NULL OR p_model_version IS NULL OR length(p_content_hash) <> 64 OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR p_model_version <> 'all-MiniLM-L6-v2:384:v1' THEN
    RAISE EXCEPTION 'Invalid profile embedding metadata';
  END IF;
  INSERT INTO public.profile_scoring_embeddings (user_id, embedding, content_hash, model_version)
  VALUES (auth.uid(), p_embedding, p_content_hash, p_model_version)
  ON CONFLICT (user_id) DO UPDATE SET embedding = EXCLUDED.embedding,
    content_hash = EXCLUDED.content_hash, model_version = EXCLUDED.model_version
  WHERE public.profile_scoring_embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash
     OR public.profile_scoring_embeddings.model_version IS DISTINCT FROM EXCLUDED.model_version;
END;
$_$;


ALTER FUNCTION "public"."save_profile_embedding"("p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_profile_embedding_guarded"("p_expected_user_id" "uuid", "p_profile_snapshot" "jsonb", "p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE current_snapshot jsonb;
BEGIN
  IF NOT public.is_authorized_user() OR auth.uid() IS NULL
    OR p_expected_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Active account changed' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'headline',coalesce(p.headline,''),'current_role',coalesce(p.current_role,''),
    'summary',coalesce(p.summary,''),'keywords',coalesce(to_jsonb(p.keywords),'[]'::jsonb),
    'tools_software',coalesce(to_jsonb(p.tools_software),'[]'::jsonb),'languages',coalesce(to_jsonb(p.languages),'[]'::jsonb),
    'certifications',coalesce(p.certifications,''),'education',coalesce(p.education,''))
  INTO current_snapshot FROM public.user_profiles p WHERE p.user_id=auth.uid() FOR UPDATE;
  IF current_snapshot IS NULL OR p_profile_snapshot IS DISTINCT FROM current_snapshot THEN
    RAISE EXCEPTION 'Profile changed during inference' USING ERRCODE='40001';
  END IF;
  PERFORM public.save_profile_embedding(p_embedding,p_content_hash,p_model_version);
END $$;


ALTER FUNCTION "public"."save_profile_embedding_guarded"("p_expected_user_id" "uuid", "p_profile_snapshot" "jsonb", "p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_from_subscores"("s" "jsonb", "w" "jsonb") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT least(
    CASE WHEN coalesce((s->>'disqualified')::numeric,0) > 0
      THEN least(greatest(coalesce((w->>'disqualification_cap')::numeric,10),0),15)
      ELSE 100 END,
    greatest(0, least(100, round(
      CASE WHEN coalesce((s->>'negative_sector')::numeric,0) > 0 THEN
        least(15, coalesce((s->>'semantic')::numeric,0)*20 + coalesce((s->>'sector')::numeric,0)*10)
      ELSE
        coalesce((s->>'sector')::numeric,0)*coalesce((w->>'sector')::numeric,20) +
        coalesce((s->>'semantic')::numeric,0)*coalesce((w->>'semantic')::numeric,25) +
        coalesce((s->>'competency')::numeric,0)*coalesce((w->>'competency')::numeric,20) +
        coalesce((s->>'seniority')::numeric,0)*coalesce((w->>'seniority')::numeric,15) +
        coalesce((s->>'salary')::numeric,0)*coalesce((w->>'salary')::numeric,10) +
        coalesce((s->>'contract')::numeric,0)*coalesce((w->>'contract')::numeric,10) +
        coalesce((s->>'target_role')::numeric,0)*coalesce((w->>'target_role_bonus')::numeric,6) +
        coalesce((s->>'location')::numeric,0)*coalesce((w->>'location_bonus')::numeric,4) +
        coalesce((s->>'work_mode')::numeric,0)*coalesce((w->>'work_mode_bonus')::numeric,2) -
        coalesce((s->>'onsite_penalty')::numeric,0)*4 -
        coalesce((s->>'fixed_term')::numeric,0)*coalesce((w->>'fixed_term_penalty')::numeric,8) -
        coalesce((s->>'auth_deduction')::numeric,0)
      END))))::integer;
$$;


ALTER FUNCTION "public"."score_from_subscores"("s" "jsonb", "w" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_job_for_user"("p_user_id" "uuid", "p_job_id" bigint, "p_similarity" real) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  p public.user_profiles%ROWTYPE;
  j public.jobs%ROWTYPE;
  je public.job_scoring_embeddings%ROWTYPE;
  pe public.profile_scoring_embeddings%ROWTYPE;
  rules jsonb;
  term text;
  rule jsonb;
  full_text text;
  title_text text;
  profile_text text;
  sector_score numeric := 0.5;
  sector_name text := 'General';
  negative_sector boolean := false;
  disqualified boolean := false;
  terms_count integer := 0;
  matched_count integer := 0;
  matched jsonb := '[]'::jsonb;
  seniority_name text := 'Professional / Mid-Level';
  seniority_score numeric := 0.5;
  salary_score numeric := 0.5;
  contract_score numeric := 0.5;
  fixed_term boolean := false;
  target_role boolean := false;
  location_factor numeric := 0;
  mode_match boolean := false;
  onsite_penalty boolean := false;
  auth_deduction integer := 0;
  subs jsonb;
  score integer;
BEGIN
  SELECT * INTO p FROM public.user_profiles WHERE user_id = p_user_id;
  SELECT * INTO j FROM public.jobs WHERE id = p_job_id;
  SELECT * INTO je FROM public.job_scoring_embeddings WHERE job_id = p_job_id;
  SELECT * INTO pe FROM public.profile_scoring_embeddings WHERE user_id = p_user_id;
  IF p.user_id IS NULL OR j.id IS NULL OR je.job_id IS NULL OR pe.user_id IS NULL THEN RETURN; END IF;
  rules := coalesce(p.scoring_rules, '{}'::jsonb);
  full_text := coalesce(j.title,'') || ' ' || coalesce(j.description,'');
  title_text := coalesce(j.title,'');
  profile_text := concat_ws(' ',p.headline,p.current_role,p.summary,array_to_string(p.keywords,' '),array_to_string(p.tools_software,' '),p.certifications,p.education);
  sector_name := 'General';

  FOR term IN SELECT value FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(rules->'disqualifiers') = 'array' THEN rules->'disqualifiers' ELSE '[]'::jsonb END)
  LOOP
    BEGIN
      IF length(term) BETWEEN 1 AND 100 AND full_text ~* term THEN disqualified := true; EXIT; END IF;
    EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
  END LOOP;

  FOR rule IN SELECT value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(rules->'negative_sectors') = 'array' THEN rules->'negative_sectors' ELSE '[]'::jsonb END)
  LOOP
    FOR term IN SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(rule->'keywords') = 'array' THEN rule->'keywords' ELSE '[]'::jsonb END)
    LOOP
      BEGIN
        IF length(term) BETWEEN 1 AND 100 AND full_text ~* term AND profile_text !~* term THEN
          negative_sector := true; sector_name := coalesce(rule->>'name','Sector mismatch'); EXIT;
        END IF;
      EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
    END LOOP;
    EXIT WHEN negative_sector;
  END LOOP;
  IF negative_sector THEN sector_score := 0.05;
  ELSE
    FOR rule IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(rules->'positive_sectors') = 'array' THEN rules->'positive_sectors' ELSE '[]'::jsonb END)
    LOOP
      FOR term IN SELECT value FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(rule->'keywords') = 'array' THEN rule->'keywords' ELSE '[]'::jsonb END)
      LOOP
        BEGIN
          IF length(term) BETWEEN 1 AND 100 AND title_text ~* term THEN
            sector_score := 1; sector_name := coalesce(rule->>'name','Target Sector'); EXIT;
          ELSIF length(term) BETWEEN 1 AND 100 AND full_text ~* term AND sector_score < 0.8 THEN
            sector_score := 0.8; sector_name := coalesce(rule->>'name','Target Sector');
          END IF;
        EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
      END LOOP;
      EXIT WHEN sector_score = 1;
    END LOOP;
  END IF;

  -- Fallback to employer sector if candidate scoring rules did not classify a specific sector
  IF sector_name = 'General' AND j.employer_id IS NOT NULL THEN
    SELECT coalesce(nullif(trim(sector), ''), 'General') INTO sector_name
    FROM public.employers WHERE id = j.employer_id;
  END IF;

  FOR rule IN SELECT value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(rules->'seniority_tiers') = 'array' THEN rules->'seniority_tiers' ELSE '[]'::jsonb END)
  LOOP
    FOR term IN SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(rule->'keywords') = 'array' THEN rule->'keywords' ELSE '[]'::jsonb END)
    LOOP
      BEGIN
        IF length(term) BETWEEN 1 AND 100 AND title_text ~* term THEN
          seniority_name := coalesce(rule->>'name','Seniority Match');
          seniority_score := least(1,greatest(0,coalesce((rule->>'score_weight')::numeric,1)));
          EXIT;
        END IF;
      EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
    END LOOP;
    EXIT WHEN seniority_name <> 'Professional / Mid-Level';
  END LOOP;

  FOR term IN SELECT DISTINCT value FROM (
    SELECT unnest(coalesce(p.keywords,'{}'::text[])) AS value
    UNION SELECT unnest(coalesce(p.tools_software,'{}'::text[]))
    UNION SELECT regexp_split_to_table(coalesce(p.certifications,''),'[,;\n]+')
    UNION SELECT unnest(coalesce(p.target_roles,'{}'::text[]))
  ) s WHERE length(value) BETWEEN 2 AND 50
  LOOP
    terms_count := terms_count + 1;
    BEGIN
      IF public.jobpulse_has_literal_skill(full_text,term) THEN
        matched_count := matched_count + 1;
        matched := matched || to_jsonb(term);
      END IF;
    END;
  END LOOP;
  IF j.salary_currency = 'EUR' AND j.salary_period = 'annual'
     AND coalesce(j.salary_max_amount,j.salary_min_amount) IS NOT NULL THEN
    salary_score := CASE WHEN coalesce(j.salary_max_amount,j.salary_min_amount) >= p.salary_min THEN 1
      WHEN coalesce(j.salary_max_amount,j.salary_min_amount) < p.salary_min * 0.8 THEN 0.3 ELSE 0.6 END;
  END IF;
  fixed_term := (full_text || ' ' || j.employment_type) ~* '(fixed[- ]term|temporary|contract role|internship|specified purpose)';
  contract_score := CASE WHEN p.employment = 'Open to all' THEN 1
    WHEN fixed_term THEN CASE WHEN p.employment = 'Permanent only' THEN 0.55 ELSE 1 END
    WHEN (full_text || ' ' || j.employment_type) ~* '(permanent|indefinite|continuing|tenured)' THEN
      CASE WHEN p.employment = 'Contract / Specified Purpose' THEN 0.55 ELSE 1 END
    ELSE 0.85 END;
  SELECT EXISTS(SELECT 1 FROM unnest(coalesce(p.target_roles,'{}'::text[])) x
    WHERE x <> '' AND position(lower(x) in lower(title_text)) > 0) INTO target_role;
  SELECT coalesce(max(greatest(0.4,1 - (ord - 1)*0.2)),0) INTO location_factor
    FROM unnest(coalesce(p.target_locations,'{}'::text[])) WITH ORDINALITY AS l(value,ord)
    WHERE value <> '' AND position(lower(value) in lower(full_text || ' ' || j.location)) > 0;
  mode_match := (coalesce(p.work_mode,'') ~* 'remote' AND full_text ~* '(remote|work from home|wfh)')
    OR (coalesce(p.work_mode,'') ~* 'hybrid' AND full_text ~* '(hybrid|blended working)');
  onsite_penalty := NOT mode_match AND full_text ~* '(on-site|onsite|office-based|in-person)'
    AND coalesce(p.work_mode,'') !~* '(on-site|onsite)';
  IF coalesce(p.work_authorization,'') ~* '(sponsor|permit|visa|require)'
    AND full_text ~* '(no visa sponsorship|sponsorship not available|cannot sponsor)' THEN
    auth_deduction := 12;
  END IF;
  subs := jsonb_build_object('sector',sector_score,'semantic',least(1,greatest(0,p_similarity)),
    'competency',CASE WHEN terms_count = 0 THEN 0 ELSE least(1,matched_count::numeric / terms_count * 1.5) END,
    'seniority',seniority_score,'salary',salary_score,'contract',contract_score,
    'target_role',CASE WHEN target_role THEN 1 ELSE 0 END,'location',location_factor,
    'work_mode',CASE WHEN mode_match THEN 1 ELSE 0 END,'onsite_penalty',CASE WHEN onsite_penalty THEN 1 ELSE 0 END,
    'fixed_term',CASE WHEN fixed_term AND p.employment = 'Permanent only' THEN 1 ELSE 0 END,
    'auth_deduction',auth_deduction,'negative_sector',CASE WHEN negative_sector THEN 1 ELSE 0 END,
    'disqualified',CASE WHEN disqualified THEN 1 ELSE 0 END);
  score := public.score_from_subscores(subs, rules->'weights');
  INSERT INTO public.user_job_evaluations (user_id,job_id,relevance,fit_tier,matched_skills,ai_analysis,
    calculated_at,scoring_job_hash,scoring_profile_hash,scoring_version)
  VALUES (p_user_id,p_job_id,score,public.fit_tier_for_score(score),matched,
    jsonb_build_object('fit_score',score,'fit_tier',public.fit_tier_for_score(score),
      'role_sector',sector_name,'seniority_level',seniority_name,'salary_fit','',
      'alignments','[]'::jsonb,'mismatch_flags',CASE WHEN disqualified THEN '["Disqualified Dealbreaker"]'::jsonb ELSE '[]'::jsonb END,
      'reasoning',CASE WHEN disqualified THEN 'Role matches a profile dealbreaker.' ELSE 'Calculated from profile preferences.' END,
      'matched_skills',matched,'semantic_similarity',p_similarity,'sub_scores',subs),
    now(),je.content_hash,pe.content_hash,'native-sql-v2')
  ON CONFLICT (user_id,job_id) DO UPDATE SET relevance=EXCLUDED.relevance,fit_tier=EXCLUDED.fit_tier,
    matched_skills=EXCLUDED.matched_skills,ai_analysis=EXCLUDED.ai_analysis,calculated_at=EXCLUDED.calculated_at,
    scoring_job_hash=EXCLUDED.scoring_job_hash,scoring_profile_hash=EXCLUDED.scoring_profile_hash,
    scoring_version=EXCLUDED.scoring_version;
END;
$$;


ALTER FUNCTION "public"."score_job_for_user"("p_user_id" "uuid", "p_job_id" bigint, "p_similarity" real) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_new_job_embedding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN UPDATE public.scoring_catalog_generation SET generation=generation+1 WHERE id; RETURN NULL; END $$;


ALTER FUNCTION "public"."score_new_job_embedding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_saved"("p_job_id" bigint, "p_saved" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE owner_id uuid:=auth.uid();
BEGIN
 IF owner_id IS NULL OR NOT public.is_authorized_user() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_saved IS NULL THEN RAISE EXCEPTION 'Saved state is required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.user_job_statuses(user_id,job_id,status,is_saved) VALUES(owner_id,p_job_id,'new',p_saved)
 ON CONFLICT(user_id,job_id) DO UPDATE SET is_saved=excluded.is_saved,updated_at=now();
END $$;


ALTER FUNCTION "public"."set_job_saved"("p_job_id" bigint, "p_saved" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_id_from_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF caller IS NULL OR (NEW.user_id IS NOT NULL AND NEW.user_id <> caller) THEN
      RAISE EXCEPTION 'Write owner differs from authenticated account' USING ERRCODE='42501';
    END IF;
    NEW.user_id := caller;
  ELSIF NEW.user_id IS NULL THEN
    NEW.user_id := caller;
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Active Auth user required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_user_id_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_profile_scoring_inputs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE rules jsonb:=coalesce(NEW.scoring_rules,'{}'::jsonb); part jsonb; item jsonb; term jsonb; k text; v jsonb;
BEGIN
 IF jsonb_typeof(rules)<>'object' OR octet_length(rules::text)>65536 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid scoring rules';
 END IF;
 FOR k,v IN SELECT * FROM jsonb_each(rules) LOOP
  IF k NOT IN ('weights','positive_sectors','negative_sectors','seniority_tiers','disqualifiers') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unknown scoring rule';
  END IF;
  IF k='weights' THEN
   IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'Invalid scoring weights' USING ERRCODE='22023'; END IF;
   FOR k,part IN SELECT * FROM jsonb_each(v) LOOP
    IF k NOT IN ('sector','semantic','competency','seniority','salary','contract','target_role_bonus','location_bonus','work_mode_bonus','fixed_term_penalty','disqualification_cap')
      OR jsonb_typeof(part)<>'number' THEN RAISE EXCEPTION 'Invalid scoring weight' USING ERRCODE='22023'; END IF;
    IF part::numeric<0 OR part::numeric>100 THEN RAISE EXCEPTION 'Scoring weight out of range' USING ERRCODE='22023'; END IF;
   END LOOP;
  ELSE
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Invalid scoring rule list' USING ERRCODE='22023'; END IF;
   IF jsonb_array_length(v)>50 THEN RAISE EXCEPTION 'Too many scoring rules' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP
    IF k='disqualifiers' THEN
     IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>128 THEN RAISE EXCEPTION 'Invalid disqualifier' USING ERRCODE='22023'; END IF;
    ELSE
     IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
       OR length(item->>'name')>128 OR jsonb_typeof(item->'keywords') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid sector rule' USING ERRCODE='22023';
     END IF;
     IF jsonb_array_length(item->'keywords')>50 THEN RAISE EXCEPTION 'Too many rule terms' USING ERRCODE='22023'; END IF;
     FOR term IN SELECT * FROM jsonb_array_elements(item->'keywords') LOOP
      IF jsonb_typeof(term)<>'string' OR length(term#>>'{}')>128 THEN RAISE EXCEPTION 'Invalid rule term' USING ERRCODE='22023'; END IF;
     END LOOP;
     IF item ? 'score_weight' THEN
      IF jsonb_typeof(item->'score_weight')<>'number' THEN RAISE EXCEPTION 'Invalid seniority weight' USING ERRCODE='22023'; END IF;
      IF (item->>'score_weight')::numeric<0 OR (item->>'score_weight')::numeric>1 THEN RAISE EXCEPTION 'Seniority weight out of range' USING ERRCODE='22023'; END IF;
     END IF;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF cardinality(NEW.keywords)>100 OR cardinality(NEW.target_roles)>100 OR cardinality(NEW.target_locations)>100
  OR cardinality(NEW.tools_software)>100 OR cardinality(NEW.languages)>100
  OR length(NEW.summary)>20000 OR NEW.salary_min<0 OR NEW.salary_min>10000000 THEN
  RAISE EXCEPTION 'Profile matching inputs exceed limits' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY coalesce(NEW.keywords,'{}') || coalesce(NEW.target_roles,'{}') || coalesce(NEW.target_locations,'{}') || coalesce(NEW.tools_software,'{}') || coalesce(NEW.languages,'{}') LOOP
  IF k IS NULL OR length(k)>128 THEN RAISE EXCEPTION 'Invalid profile term' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."validate_profile_scoring_inputs"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."authorized_users" (
    "id" bigint NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
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



CREATE TABLE IF NOT EXISTS "public"."boards" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "board" "text" NOT NULL,
    "region" "text" DEFAULT ''::"text" NOT NULL,
    "company" "text" NOT NULL,
    "employer_id" bigint,
    "careers_url" "text" NOT NULL,
    "sector" "text" DEFAULT 'General'::"text" NOT NULL,
    "priority" integer DEFAULT 50 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "discovery_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "cooldown_until" timestamp with time zone,
    "last_error" "text",
    "last_verified_at" timestamp with time zone,
    "last_crawled_at" timestamp with time zone,
    "last_ingested_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "boards_board_check" CHECK ((("length"("btrim"("board")) >= 1) AND ("length"("btrim"("board")) <= 500))),
    CONSTRAINT "boards_careers_url_check" CHECK (("careers_url" ~ '^https?://'::"text")),
    CONSTRAINT "boards_company_check" CHECK ((("length"("btrim"("company")) >= 1) AND ("length"("btrim"("company")) <= 500))),
    CONSTRAINT "boards_consecutive_failures_check" CHECK (("consecutive_failures" >= 0)),
    CONSTRAINT "boards_last_ingested_count_check" CHECK (("last_ingested_count" >= 0)),
    CONSTRAINT "boards_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "boards_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 100))),
    CONSTRAINT "boards_provider_check" CHECK (("provider" ~ '^[a-z][a-z0-9_]{0,39}$'::"text")),
    CONSTRAINT "boards_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'rejected'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."boards" OWNER TO "postgres";


COMMENT ON TABLE "public"."boards" IS 'Crawl-target catalog: which company is crawled on which provider/board. Public crawl metadata only; no candidate or owner data.';



COMMENT ON COLUMN "public"."boards"."board" IS 'Provider-native board id (slug, tenant/site, subdomain). Non-empty; identity is (provider, lower(board), region).';



COMMENT ON COLUMN "public"."boards"."status" IS 'pending = unproven but crawled; active = proven by a successful crawl; rejected = invalid candidate kept for the record; retired = no longer crawled.';



COMMENT ON COLUMN "public"."boards"."discovery_source" IS 'Where the row came from: manual, config, seed, harvest, contribution, or discovery.';



COMMENT ON COLUMN "public"."boards"."metadata" IS 'Free-form discovery/verification evidence; never candidate data.';



ALTER TABLE "public"."boards" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."boards_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."candidate_scoring_work" (
    "user_id" "uuid" NOT NULL,
    "desired_revision" bigint DEFAULT 1 NOT NULL,
    "completed_revision" bigint DEFAULT 0 NOT NULL,
    "fingerprint" "text" NOT NULL,
    "completed_fingerprint" "text" DEFAULT ''::"text" NOT NULL,
    "needs_embedding" boolean DEFAULT false NOT NULL,
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "catalog_generation" bigint DEFAULT 0 NOT NULL,
    "completed_catalog_generation" bigint DEFAULT 0 NOT NULL,
    "job_ids" bigint[],
    "shortlist_ids" bigint[],
    "cursor" integer DEFAULT 0 NOT NULL,
    "top_k" integer DEFAULT 1500 NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "retry_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error_code" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "candidate_scoring_work_state_check" CHECK (("state" = ANY (ARRAY['awaiting_embedding'::"text", 'pending'::"text", 'running'::"text", 'complete'::"text", 'failed'::"text"]))),
    CONSTRAINT "candidate_scoring_work_top_k_check" CHECK ((("top_k" >= 1) AND ("top_k" <= 1500)))
);


ALTER TABLE "public"."candidate_scoring_work" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_stats" (
    "id" boolean DEFAULT true NOT NULL,
    "job_count" bigint DEFAULT 0 NOT NULL,
    "locations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sectors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_valid" boolean DEFAULT false NOT NULL,
    CONSTRAINT "catalog_stats_id_check" CHECK ("id"),
    CONSTRAINT "catalog_stats_job_count_check" CHECK (("job_count" >= 0)),
    CONSTRAINT "catalog_stats_locations_check" CHECK (("jsonb_typeof"("locations") = 'array'::"text")),
    CONSTRAINT "catalog_stats_sectors_check" CHECK (("jsonb_typeof"("sectors") = 'array'::"text"))
);


ALTER TABLE "public"."catalog_stats" OWNER TO "postgres";


COMMENT ON TABLE "public"."catalog_stats" IS 'Shared catalogue facets (job count, locations, employer sectors) for get_overview_metrics; refreshed by the scraper.';



CREATE TABLE IF NOT EXISTS "public"."employer_office_lookups" (
    "employer_id" bigint NOT NULL,
    "employer_name" "text" NOT NULL,
    "location" "text" NOT NULL,
    "status" "text" NOT NULL,
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retry_after" timestamp with time zone NOT NULL,
    "office_place_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "employer_office_lookups_location_check" CHECK ((("length"("location") >= 1) AND ("length"("location") <= 500))),
    CONSTRAINT "employer_office_lookups_office_place_ids_check" CHECK (("jsonb_typeof"("office_place_ids") = 'array'::"text")),
    CONSTRAINT "employer_office_lookups_status_check" CHECK (("status" = ANY (ARRAY['found'::"text", 'unresolved'::"text", 'ambiguous'::"text", 'remote'::"text", 'provider_failed'::"text"])))
);


ALTER TABLE "public"."employer_office_lookups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employer_offices" (
    "employer_id" bigint NOT NULL,
    "place_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "city" "text",
    "country_code" "text",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "website" "text",
    "website_domain" "text",
    "categories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source" "text" DEFAULT 'Geoapify / OpenStreetMap contributors'::"text" NOT NULL,
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employer_offices_categories_check" CHECK (("jsonb_typeof"("categories") = 'array'::"text")),
    CONSTRAINT "employer_offices_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "employer_offices_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);


ALTER TABLE "public"."employer_offices" OWNER TO "postgres";


COMMENT ON TABLE "public"."employer_offices" IS 'Named company-place discovery, not proof that a vacancy is at this office. Categories are classification evidence, not a verified employer sector.';



CREATE TABLE IF NOT EXISTS "public"."employers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "sector" "text" NOT NULL,
    "priority" integer DEFAULT 1 NOT NULL,
    "careers_url" "text" NOT NULL,
    "discovered_jobs_url" "text",
    "last_scraped_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "opportunities_found" integer DEFAULT 0,
    "location" "text",
    "latitude" double precision,
    "longitude" double precision,
    "description" "text",
    "website" "text",
    "metadata_source" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "size" "text",
    "enriched_at" timestamp with time zone,
    CONSTRAINT "employers_metadata_source_check" CHECK (("metadata_source" = ANY (ARRAY['unverified'::"text", 'curated'::"text", 'watchlist'::"text", 'verified'::"text"]))),
    CONSTRAINT "employers_size_check" CHECK (("size" = ANY (ARRAY['1-10'::"text", '11-50'::"text", '51-200'::"text", '201-500'::"text", '501-1000'::"text", '1001-5000'::"text", '5000+'::"text"])))
);


ALTER TABLE "public"."employers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employers"."metadata_source" IS 'Evidence for employer metadata. Legacy guesses are unverified.';



COMMENT ON COLUMN "public"."employers"."size" IS 'Headcount bracket of the company derived from enrichment or verified evidence.';



COMMENT ON COLUMN "public"."employers"."enriched_at" IS 'Timestamp of the latest metadata and office enrichment run.';



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
    "employer_id" bigint,
    "latitude" double precision,
    "longitude" double precision,
    "coordinate_source" "text",
    "location_verification" "jsonb",
    "closed_at" timestamp with time zone,
    "closed_reason" "text",
    CONSTRAINT "jobs_coordinate_source_check" CHECK ((("coordinate_source" IS NULL) OR ("coordinate_source" = ANY (ARRAY['posting'::"text", 'geocoded'::"text"])))),
    CONSTRAINT "jobs_salary_amounts_valid" CHECK (((("salary_min_amount" IS NULL) OR ("salary_min_amount" >= 0)) AND (("salary_max_amount" IS NULL) OR ("salary_max_amount" >= 0)) AND (("salary_min_amount" IS NULL) OR ("salary_max_amount" IS NULL) OR ("salary_min_amount" <= "salary_max_amount"))))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."jobs"."salary_text" IS 'Original source display text; do not use for numeric filtering or sorting.';



COMMENT ON COLUMN "public"."jobs"."salary_min_amount" IS 'Minimum advertised amount in salary_currency per salary_period; not necessarily annual.';



COMMENT ON COLUMN "public"."jobs"."salary_max_amount" IS 'Maximum advertised amount in salary_currency per salary_period; not necessarily annual.';



COMMENT ON COLUMN "public"."jobs"."coordinate_source" IS 'Only posting coordinates describe the vacancy; company headquarters do not.';



COMMENT ON COLUMN "public"."jobs"."location_verification" IS 'External vacancy-location lookup: original input, provider, time, status, precision and confidence. No employer headquarters substitution.';



COMMENT ON COLUMN "public"."jobs"."closed_at" IS 'Soft-close timestamp; closed postings are hidden from lists/map/overview but retained for candidate tracking. NULL = open.';



COMMENT ON COLUMN "public"."jobs"."closed_reason" IS 'Why the posting was closed: unseen after a successful source crawl, or liveness expiry.';



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


CREATE TABLE IF NOT EXISTS "public"."scoring_catalog_generation" (
    "id" boolean DEFAULT true NOT NULL,
    "generation" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "scoring_catalog_generation_id_check" CHECK ("id")
);


ALTER TABLE "public"."scoring_catalog_generation" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_saved" boolean DEFAULT false NOT NULL,
    CONSTRAINT "user_job_statuses_pipeline_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'applied'::"text", 'interviewing'::"text", 'rejected'::"text", 'not_interested'::"text"])))
);


ALTER TABLE "public"."user_job_statuses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_job_statuses"."is_saved" IS 'Owner-only job bookmark. Included in account export and removed on account deletion.';



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
    "work_authorization" "text" DEFAULT ''::"text",
    "gender" "text" DEFAULT ''::"text",
    "headline" "text" DEFAULT ''::"text" NOT NULL,
    "current_role" "text" DEFAULT ''::"text" NOT NULL,
    "current_company" "text" DEFAULT ''::"text",
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "target_roles" "text"[] DEFAULT '{}'::"text"[],
    "target_locations" "text"[] DEFAULT '{}'::"text"[],
    "work_mode" "text" DEFAULT ''::"text",
    "salary_min" integer DEFAULT 0 NOT NULL,
    "employment" "text" DEFAULT ''::"text" NOT NULL,
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



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidate_scoring_work"
    ADD CONSTRAINT "candidate_scoring_work_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."catalog_stats"
    ADD CONSTRAINT "catalog_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employer_office_lookups"
    ADD CONSTRAINT "employer_office_lookups_pkey" PRIMARY KEY ("employer_id", "location");



ALTER TABLE ONLY "public"."employer_offices"
    ADD CONSTRAINT "employer_offices_pkey" PRIMARY KEY ("employer_id", "place_id");



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



ALTER TABLE ONLY "public"."scoring_catalog_generation"
    ADD CONSTRAINT "scoring_catalog_generation_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "authorized_users_invited_by_idx" ON "public"."authorized_users" USING "btree" ("invited_by");



CREATE UNIQUE INDEX "authorized_users_user_id_key" ON "public"."authorized_users" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "boards_company_idx" ON "public"."boards" USING "btree" ("lower"("company"));



CREATE INDEX "boards_crawlable_idx" ON "public"."boards" USING "btree" ("provider", "priority" DESC) WHERE ("enabled" AND ("status" = ANY (ARRAY['pending'::"text", 'active'::"text"])));



CREATE INDEX "boards_employer_id_idx" ON "public"."boards" USING "btree" ("employer_id");



CREATE UNIQUE INDEX "boards_identity_key" ON "public"."boards" USING "btree" ("provider", "lower"("board"), "region") WHERE ("status" = ANY (ARRAY['pending'::"text", 'active'::"text"]));



CREATE INDEX "candidate_scoring_work_schedule_idx" ON "public"."candidate_scoring_work" USING "btree" ("retry_at", "updated_at");



CREATE INDEX "idx_job_scoring_embeddings_hnsw" ON "public"."job_scoring_embeddings" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "idx_jobs_company" ON "public"."jobs" USING "btree" ("company");



CREATE INDEX "idx_jobs_company_trgm" ON "public"."jobs" USING "gin" ("company" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_jobs_employer_id" ON "public"."jobs" USING "btree" ("employer_id");



CREATE INDEX "idx_jobs_last_seen_at" ON "public"."jobs" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "idx_jobs_location" ON "public"."jobs" USING "btree" ("location");



CREATE INDEX "idx_jobs_salary_max_amount" ON "public"."jobs" USING "btree" ("salary_max_amount" DESC NULLS LAST);



CREATE INDEX "idx_jobs_title_trgm" ON "public"."jobs" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_user_cover_letters_user_id" ON "public"."user_cover_letters" USING "btree" ("user_id");



CREATE INDEX "idx_user_cvs_user_id" ON "public"."user_cvs" USING "btree" ("user_id");



CREATE INDEX "idx_user_job_evaluations_job_id" ON "public"."user_job_evaluations" USING "btree" ("job_id");



CREATE INDEX "idx_user_job_evaluations_user_relevance" ON "public"."user_job_evaluations" USING "btree" ("user_id", "relevance" DESC);



CREATE INDEX "idx_user_job_statuses_job_id" ON "public"."user_job_statuses" USING "btree" ("job_id");



CREATE INDEX "jobs_open_last_seen_idx" ON "public"."jobs" USING "btree" ("last_seen_at") WHERE ("closed_at" IS NULL);



CREATE INDEX "jobs_open_source_idx" ON "public"."jobs" USING "btree" ("source") WHERE ("closed_at" IS NULL);



CREATE UNIQUE INDEX "user_cover_letters_storage_path_key" ON "public"."user_cover_letters" USING "btree" ("storage_path") WHERE ("storage_path" IS NOT NULL);



CREATE UNIQUE INDEX "user_cvs_storage_path_key" ON "public"."user_cvs" USING "btree" ("storage_path") WHERE ("storage_path" IS NOT NULL);



CREATE UNIQUE INDEX "user_job_evaluations_user_id_job_key" ON "public"."user_job_evaluations" USING "btree" ("user_id", "job_id");



CREATE INDEX "user_job_statuses_saved_owner_idx" ON "public"."user_job_statuses" USING "btree" ("user_id", "job_id") WHERE "is_saved";



CREATE UNIQUE INDEX "user_job_statuses_user_id_job_key" ON "public"."user_job_statuses" USING "btree" ("user_id", "job_id");



CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "bind_existing_verified_account" BEFORE INSERT OR UPDATE OF "email" ON "public"."authorized_users" FOR EACH ROW EXECUTE FUNCTION "public"."bind_existing_verified_account"();



CREATE OR REPLACE TRIGGER "clear_changed_job_location_verification" BEFORE UPDATE OF "location" ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."clear_changed_job_location_verification"();



CREATE OR REPLACE TRIGGER "employers_invalidate_catalog_stats" AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON "public"."employers" FOR EACH STATEMENT EXECUTE FUNCTION "public"."invalidate_catalog_stats"();



CREATE OR REPLACE TRIGGER "enqueue_profile_embedding_scoring" AFTER INSERT OR UPDATE ON "public"."profile_scoring_embeddings" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_profile_scoring"();



CREATE OR REPLACE TRIGGER "enqueue_profile_scoring" AFTER INSERT OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_profile_scoring"();



CREATE OR REPLACE TRIGGER "jobs_invalidate_catalog_stats" AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON "public"."jobs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."invalidate_catalog_stats"();



CREATE OR REPLACE TRIGGER "normalize_saved_job_status" BEFORE INSERT OR UPDATE ON "public"."user_job_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_saved_job_status"();



CREATE OR REPLACE TRIGGER "score_new_job_embedding" AFTER INSERT OR DELETE OR UPDATE ON "public"."job_scoring_embeddings" FOR EACH STATEMENT EXECUTE FUNCTION "public"."score_new_job_embedding"();



CREATE OR REPLACE TRIGGER "trg_check_user_cover_letter_limit" BEFORE INSERT ON "public"."user_cover_letters" FOR EACH ROW EXECUTE FUNCTION "public"."check_user_cover_letter_limit"();



CREATE OR REPLACE TRIGGER "trg_check_user_cv_limit" BEFORE INSERT ON "public"."user_cvs" FOR EACH ROW EXECUTE FUNCTION "public"."check_user_cv_limit"();



CREATE OR REPLACE TRIGGER "trg_jobs_normalize_salary" BEFORE INSERT OR UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_job_salary"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_cover_letters" BEFORE INSERT OR UPDATE ON "public"."user_cover_letters" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_cvs" BEFORE INSERT OR UPDATE ON "public"."user_cvs" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_job_evaluations" BEFORE INSERT OR UPDATE ON "public"."user_job_evaluations" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_job_statuses" BEFORE INSERT OR UPDATE ON "public"."user_job_statuses" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "trg_set_user_id_profiles" BEFORE INSERT OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_id_from_auth"();



CREATE OR REPLACE TRIGGER "validate_profile_scoring_inputs" BEFORE INSERT OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_profile_scoring_inputs"();



ALTER TABLE ONLY "public"."authorized_users"
    ADD CONSTRAINT "authorized_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."candidate_scoring_work"
    ADD CONSTRAINT "candidate_scoring_work_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employer_office_lookups"
    ADD CONSTRAINT "employer_office_lookups_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employer_offices"
    ADD CONSTRAINT "employer_offices_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_scoring_embeddings"
    ADD CONSTRAINT "job_scoring_embeddings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE SET NULL;



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



CREATE POLICY "Users read own authorization or invitations" ON "public"."authorized_users" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("invited_by" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user"))));



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



CREATE POLICY "authorized_office_read" ON "public"."employer_offices" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_authorized_user"() AS "is_authorized_user"));



ALTER TABLE "public"."authorized_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidate_scoring_work" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employer_office_lookups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employer_offices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_scoring_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_scoring_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_catalog_generation" ENABLE ROW LEVEL SECURITY;


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






























































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."apply_job_location_verifications"("p_records" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_job_location_verifications"("p_records" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bind_existing_verified_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bind_existing_verified_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bind_verified_invitation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bind_verified_invitation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_cover_letter_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_user_cover_letter_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_cv_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_user_cv_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_changed_job_location_verification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_changed_job_location_verification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_stale_jobs"("p_grace_days" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_stale_jobs"("p_grace_days" integer, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_default_user_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_default_user_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_invitation"("target_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_invitation"("target_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_invitation"("target_email" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_invitation"("invitation_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_invitation"("invitation_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_invitation"("invitation_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."enqueue_candidate_scoring"("p_user_id" "uuid", "p_top_k" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_candidate_scoring"("p_user_id" "uuid", "p_top_k" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_profile_scoring"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_profile_scoring"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fit_tier_for_score"("p_score" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fit_tier_for_score"("p_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fit_tier_for_score"("p_score" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_job_map"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_bounds" double precision[], "p_zoom" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_job_map"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_bounds" double precision[], "p_zoom" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_job_map"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_bounds" double precision[], "p_zoom" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_jobs_page"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_jobs_page"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_jobs_page"("p_status" "text", "p_sector" "text", "p_min_match" integer, "p_location" "text", "p_salary" "text", "p_search" "text", "p_sort_by" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_overview_metrics"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_overview_metrics"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_overview_metrics"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_profile_embedding_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_profile_embedding_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profile_embedding_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invalidate_catalog_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invalidate_catalog_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_authorized_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_authorized_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_authorized_user"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."jobpulse_catalog_sectors"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobpulse_catalog_sectors"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobpulse_has_literal_skill"("p_text" "text", "p_skill" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobpulse_has_literal_skill"("p_text" "text", "p_skill" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"("input" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."jobpulse_sector_group"("p_sector" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobpulse_sector_group"("p_sector" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_duplicate_catalog_jobs"("p_keeper_id" bigint, "p_duplicate_ids" bigint[], "p_dedupe_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_duplicate_catalog_jobs"("p_keeper_id" bigint, "p_duplicate_ids" bigint[], "p_dedupe_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_job_salary"() TO "service_role";
GRANT ALL ON FUNCTION "public"."normalize_job_salary"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_job_salary"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."normalize_saved_job_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_saved_job_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."owns_document_object"("object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_document_object"("object_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."owns_document_object"("object_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pending_employer_office_lookups"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pending_employer_office_lookups"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_candidate_scoring"("p_batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_candidate_scoring"("p_batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_candidate_scoring_queue"("p_max_slices" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_candidate_scoring_queue"("p_max_slices" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_stale_catalog_jobs"("p_retention_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_stale_catalog_jobs"("p_retention_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_deleted_account_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_deleted_account_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_board_outcome"("p_board_id" bigint, "p_success" boolean, "p_ingested" integer, "p_error" "text", "p_found" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_board_outcome"("p_board_id" bigint, "p_success" boolean, "p_ingested" integer, "p_error" "text", "p_found" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_catalog_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_catalog_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rescore_user"("p_user_id" "uuid", "p_top_k" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rescore_user"("p_user_id" "uuid", "p_top_k" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rescore_user"("p_user_id" "uuid", "p_top_k" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_employer_office_lookup"("p_record" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_employer_office_lookup"("p_record" "jsonb") TO "service_role";









REVOKE ALL ON FUNCTION "public"."score_from_subscores"("s" "jsonb", "w" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."score_from_subscores"("s" "jsonb", "w" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."score_from_subscores"("s" "jsonb", "w" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."score_job_for_user"("p_user_id" "uuid", "p_job_id" bigint, "p_similarity" real) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."score_job_for_user"("p_user_id" "uuid", "p_job_id" bigint, "p_similarity" real) TO "service_role";



REVOKE ALL ON FUNCTION "public"."score_new_job_embedding"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."score_new_job_embedding"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_job_saved"("p_job_id" bigint, "p_saved" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_job_saved"("p_job_id" bigint, "p_saved" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_saved"("p_job_id" bigint, "p_saved" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_id_from_auth"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_id_from_auth"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_profile_scoring_inputs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_profile_scoring_inputs"() TO "service_role";




































GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."authorized_users" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."authorized_users" TO "authenticated";
GRANT ALL ON TABLE "public"."authorized_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."authorized_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."authorized_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."authorized_users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."boards" TO "service_role";



GRANT ALL ON SEQUENCE "public"."boards_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."candidate_scoring_work" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_stats" TO "service_role";



GRANT ALL ON TABLE "public"."employer_office_lookups" TO "service_role";



GRANT ALL ON TABLE "public"."employer_offices" TO "service_role";
GRANT SELECT ON TABLE "public"."employer_offices" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."employers" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."employers" TO "authenticated";
GRANT ALL ON TABLE "public"."employers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."employers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."employers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."employers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."job_scoring_embeddings" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."jobs" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."jobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."jobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."jobs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profile_scoring_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_catalog_generation" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."sources" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."sources" TO "authenticated";
GRANT ALL ON TABLE "public"."sources" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sources_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sources_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sources_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_cover_letters" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_cover_letters" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cover_letters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_cover_letters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_cover_letters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_cover_letters_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_cvs" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_cvs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cvs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_cvs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_cvs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_cvs_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_job_evaluations" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_job_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_job_evaluations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_job_evaluations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_job_evaluations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_job_evaluations_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_job_statuses" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_job_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_job_statuses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_job_statuses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_job_statuses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_job_statuses_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_profiles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_profiles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_profiles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_profiles_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "bind_verified_invitation" AFTER INSERT OR UPDATE OF "email", "email_confirmed_at" ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."bind_verified_invitation"();



CREATE OR REPLACE TRIGGER "create_default_user_profile" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_user_profile"();



CREATE OR REPLACE TRIGGER "purge_deleted_account_access" BEFORE DELETE ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."purge_deleted_account_access"();



CREATE POLICY "Users can delete own avatar" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "Users can only delete own storage documents" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can only update own storage documents" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object"))) WITH CHECK ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can only upload own storage documents" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'user-documents'::"text") AND ("split_part"("name", '/'::"text", 1) = (( SELECT "auth"."uid"() AS "uid"))::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can only view own storage documents" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'user-documents'::"text") AND ( SELECT "public"."owns_document_object"("objects"."name") AS "owns_document_object")));



CREATE POLICY "Users can read own avatar metadata" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "Users can update own avatar" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text"))) WITH CHECK ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "Users can upload own avatar" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND ( SELECT "public"."is_authorized_user"() AS "is_authorized_user") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));




-- =============================================================================
-- Role privileges.
-- A schema-only dump restores default privileges but not the explicit browser-role
-- revokes the security migrations apply, so they are restated here.
-- =============================================================================

SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."apply_job_location_verifications"(jsonb) FROM "anon";

REVOKE ALL ON FUNCTION "public"."apply_job_location_verifications"(jsonb) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."bind_existing_verified_account"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."bind_existing_verified_account"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."bind_verified_invitation"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."bind_verified_invitation"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."check_user_cover_letter_limit"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."check_user_cover_letter_limit"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."check_user_cv_limit"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."check_user_cv_limit"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."clear_changed_job_location_verification"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."clear_changed_job_location_verification"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."close_stale_jobs"(integer, integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."close_stale_jobs"(integer, integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."create_default_user_profile"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."create_default_user_profile"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."create_invitation"(text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."delete_invitation"(bigint) FROM "anon";

REVOKE ALL ON FUNCTION "public"."enqueue_candidate_scoring"(uuid, integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."enqueue_candidate_scoring"(uuid, integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."enqueue_profile_scoring"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."enqueue_profile_scoring"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."fit_tier_for_score"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."get_job_map"(text, text, integer, text, text, text, double precision[], integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."get_jobs_page"(text, text, integer, text, text, text, text, text, integer, integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."get_overview_metrics"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."get_profile_embedding_state"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."invalidate_catalog_stats"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."invalidate_catalog_stats"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."is_authorized_user"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."jobpulse_catalog_sectors"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."jobpulse_catalog_sectors"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."jobpulse_has_literal_skill"(text, text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."jobpulse_has_literal_skill"(text, text) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."jobpulse_literal_search_pattern"(text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."jobpulse_sector_group"(text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."jobpulse_sector_group"(text) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."merge_duplicate_catalog_jobs"(bigint, bigint[], text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."merge_duplicate_catalog_jobs"(bigint, bigint[], text) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."normalize_saved_job_status"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."normalize_saved_job_status"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."owns_document_object"(text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."pending_employer_office_lookups"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."pending_employer_office_lookups"(integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_candidate_scoring"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."process_candidate_scoring"(integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_candidate_scoring_queue"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."process_candidate_scoring_queue"(integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."prune_stale_catalog_jobs"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."prune_stale_catalog_jobs"(integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."purge_deleted_account_access"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."purge_deleted_account_access"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."record_board_outcome"(bigint, boolean, integer, text, integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."record_board_outcome"(bigint, boolean, integer, text, integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."refresh_catalog_stats"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."refresh_catalog_stats"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."rescore_user"(uuid, integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."save_employer_office_lookup"(jsonb) FROM "anon";

REVOKE ALL ON FUNCTION "public"."save_employer_office_lookup"(jsonb) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."save_profile_embedding"(extensions.vector, text, text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."save_profile_embedding_guarded"(uuid, jsonb, extensions.vector, text, text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."score_from_subscores"(jsonb, jsonb) FROM "anon";

REVOKE ALL ON FUNCTION "public"."score_job_for_user"(uuid, bigint, real) FROM "anon";

REVOKE ALL ON FUNCTION "public"."score_job_for_user"(uuid, bigint, real) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."score_new_job_embedding"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."score_new_job_embedding"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."set_job_saved"(bigint, boolean) FROM "anon";

REVOKE ALL ON FUNCTION "public"."set_user_id_from_auth"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."set_user_id_from_auth"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."validate_profile_scoring_inputs"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."validate_profile_scoring_inputs"() FROM "authenticated";

REVOKE ALL ON TABLE "public"."boards" FROM "anon";

REVOKE ALL ON TABLE "public"."boards" FROM "authenticated";

REVOKE ALL ON TABLE "public"."candidate_scoring_work" FROM "anon";

REVOKE ALL ON TABLE "public"."candidate_scoring_work" FROM "authenticated";

REVOKE ALL ON TABLE "public"."catalog_stats" FROM "anon";

REVOKE ALL ON TABLE "public"."catalog_stats" FROM "authenticated";

REVOKE ALL ON TABLE "public"."employer_office_lookups" FROM "anon";

REVOKE ALL ON TABLE "public"."employer_office_lookups" FROM "authenticated";

REVOKE ALL ON TABLE "public"."employer_offices" FROM "anon";

REVOKE ALL ON TABLE "public"."job_scoring_embeddings" FROM "anon";

REVOKE ALL ON TABLE "public"."job_scoring_embeddings" FROM "authenticated";

REVOKE ALL ON TABLE "public"."profile_scoring_embeddings" FROM "anon";

REVOKE ALL ON TABLE "public"."profile_scoring_embeddings" FROM "authenticated";

REVOKE ALL ON TABLE "public"."scoring_catalog_generation" FROM "anon";

REVOKE ALL ON TABLE "public"."scoring_catalog_generation" FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."save_profile_embedding"(extensions.vector, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."save_profile_embedding_guarded"(uuid, jsonb, extensions.vector, text, text) FROM PUBLIC;

REVOKE ALL ON TABLE "public"."authorized_users" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."authorized_users" TO "anon";

REVOKE ALL ON TABLE "public"."authorized_users" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."authorized_users" TO "authenticated";

REVOKE ALL ON TABLE "public"."employer_offices" FROM "authenticated";

GRANT SELECT ON TABLE "public"."employer_offices" TO "authenticated";

REVOKE ALL ON TABLE "public"."employers" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."employers" TO "anon";

REVOKE ALL ON TABLE "public"."employers" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."employers" TO "authenticated";

REVOKE ALL ON TABLE "public"."jobs" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."jobs" TO "anon";

REVOKE ALL ON TABLE "public"."jobs" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."jobs" TO "authenticated";

REVOKE ALL ON TABLE "public"."sources" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."sources" TO "anon";

REVOKE ALL ON TABLE "public"."sources" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."sources" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_cover_letters" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_cover_letters" TO "anon";

REVOKE ALL ON TABLE "public"."user_cover_letters" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_cover_letters" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_cvs" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_cvs" TO "anon";

REVOKE ALL ON TABLE "public"."user_cvs" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_cvs" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_job_evaluations" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_job_evaluations" TO "anon";

REVOKE ALL ON TABLE "public"."user_job_evaluations" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_job_evaluations" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_job_statuses" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_job_statuses" TO "anon";

REVOKE ALL ON TABLE "public"."user_job_statuses" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_job_statuses" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_profiles" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_profiles" TO "anon";

REVOKE ALL ON TABLE "public"."user_profiles" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE "public"."user_profiles" TO "authenticated";

-- =============================================================================
-- Bootstrap rows, Storage buckets and scheduled jobs.
-- A schema-only squash omits data manipulation; these statements restore the
-- durable state the application and its tests require on a fresh database.
-- =============================================================================

INSERT INTO public.scoring_catalog_generation (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.catalog_stats (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('user-documents', 'user-documents', false, 10485760, ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'
  ])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

SELECT cron.schedule('jobpulse-candidate-scoring', '5 seconds',
  $$SET statement_timeout='8s'; SELECT public.process_candidate_scoring_queue(50);$$);
SELECT cron.schedule('jobpulse-cron-history-retention', '17 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time<now()-interval '365 days';$$);
