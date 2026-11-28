-- Availability describes public posting evidence, independently of candidate tracking.
ALTER TABLE public.jobs
 ADD COLUMN availability_status text NOT NULL DEFAULT 'unverified'
  CHECK(availability_status IN ('active','closed','unverified')),
 ADD COLUMN availability_checked_at timestamptz,
 ADD COLUMN availability_evidence text;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_availability_evidence_check CHECK(
 availability_status='unverified' OR
 (availability_checked_at IS NOT NULL AND availability_evidence IN
 ('published_listing','published_detail','explicit_closure','published_expiry')));
CREATE INDEX jobs_availability_due_idx ON public.jobs(availability_checked_at NULLS FIRST,id);
CREATE INDEX jobs_availability_state_idx ON public.jobs(availability_status,availability_checked_at,id);
COMMENT ON COLUMN public.jobs.availability_status IS 'Public posting evidence; active confirmation expires to unverified after 24 hours. Candidate stages remain independent.';

CREATE FUNCTION public.jobpulse_availability_status(p_status text,p_checked_at timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p_status='closed' THEN 'closed'
 WHEN p_status='active' AND p_checked_at>now()-interval '24 hours' THEN 'active'
 ELSE 'unverified' END
$$;
REVOKE ALL ON FUNCTION public.jobpulse_availability_status(text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.jobpulse_availability_status(text,timestamptz) TO authenticated,service_role;

CREATE FUNCTION public.record_job_availability(p_job_id bigint,p_expected_url text,p_expected_title text,
 p_status text,p_evidence text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_job public.jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT ((p_status='active' AND p_evidence IN ('published_listing','published_detail'))
  OR (p_status='closed' AND p_evidence IN ('explicit_closure','published_expiry'))
  OR (p_status='unverified' AND p_evidence IN ('acquisition_failed','identity_unconfirmed','no_posting_evidence','redirected','deadline_exceeded')))
  OR p_status IS NULL OR p_evidence IS NULL THEN
  RAISE EXCEPTION 'Invalid availability evidence' USING ERRCODE='22023';
 END IF;
 SELECT * INTO current_job FROM public.jobs WHERE id=p_job_id AND url=p_expected_url
  AND title=p_expected_title FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- A failed request cannot erase explicit closure evidence.
 IF current_job.availability_status='closed' AND p_status='unverified' THEN RETURN false; END IF;
 UPDATE public.jobs SET availability_status=p_status,availability_checked_at=now(),availability_evidence=p_evidence,
  closed_at=CASE WHEN p_status='closed' THEN coalesce(closed_at,now())
   WHEN p_status='active' THEN NULL ELSE closed_at END WHERE id=p_job_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_job_availability(bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_availability(bigint,text,text,text,text) TO service_role;



CREATE OR REPLACE FUNCTION "public"."get_jobs_availability_page"("p_status" "text" DEFAULT 'all'::"text", "p_sector" "text" DEFAULT 'all'::"text", "p_min_match" integer DEFAULT 0, "p_location" "text" DEFAULT 'all'::"text", "p_salary" "text" DEFAULT 'all'::"text", "p_search" "text" DEFAULT NULL::"text", "p_sort_by" "text" DEFAULT 'match'::"text", "p_sort_dir" "text" DEFAULT 'desc'::"text", "p_limit" integer DEFAULT 40, "p_offset" integer DEFAULT 0, "p_availability" text DEFAULT 'active') RETURNS "jsonb"
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
  IF coalesce(p_availability,'active') NOT IN ('active','closed','unverified','all','legacy') THEN
    RAISE EXCEPTION 'Invalid availability filter' USING ERRCODE='22023';
  END IF;
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
      public.jobpulse_availability_status(j.availability_status,j.availability_checked_at) AS availability_status,
      j.availability_checked_at,j.availability_evidence,
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
    LEFT JOIN user_stats s ON s.job_id = j.id WHERE (p_availability='all' OR (p_availability='legacy' AND j.closed_at IS NULL)
       OR public.jobpulse_availability_status(j.availability_status,j.availability_checked_at)=coalesce(p_availability,'active'))
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

REVOKE ALL ON FUNCTION public.get_jobs_availability_page(text,text,integer,text,text,text,text,text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_jobs_availability_page(text,text,integer,text,text,text,text,text,integer,integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION "public"."get_job_availability_map"("p_status" "text" DEFAULT 'all'::"text", "p_sector" "text" DEFAULT 'all'::"text", "p_min_match" integer DEFAULT 0, "p_location" "text" DEFAULT 'all'::"text", "p_salary" "text" DEFAULT 'all'::"text", "p_search" "text" DEFAULT NULL::"text", "p_bounds" double precision[] DEFAULT ARRAY[('-180'::integer)::double precision, ('-90'::integer)::double precision, (180)::double precision, (90)::double precision], "p_zoom" integer DEFAULT 3, "p_availability" text DEFAULT 'active') RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE v_effective_uid uuid; v_search_pattern text; v_grid double precision; result jsonb;
BEGIN
  IF coalesce(p_availability,'active') NOT IN ('active','closed','unverified','all','legacy') THEN
    RAISE EXCEPTION 'Invalid availability filter' USING ERRCODE='22023';
  END IF;
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
      j.url, j.source, j.employer_id,
      public.jobpulse_availability_status(j.availability_status,j.availability_checked_at) AS availability_status,
      j.availability_checked_at,j.availability_evidence, j.location_verification,
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
    LEFT JOIN user_stats s ON s.job_id = j.id WHERE (p_availability='all' OR (p_availability='legacy' AND j.closed_at IS NULL)
       OR public.jobpulse_availability_status(j.availability_status,j.availability_checked_at)=coalesce(p_availability,'active'))
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

REVOKE ALL ON FUNCTION public.get_job_availability_map(text,text,integer,text,text,text,double precision[],integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_job_availability_map(text,text,integer,text,text,text,double precision[],integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION "public"."get_active_overview_metrics"() RETURNS "jsonb"
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

  SELECT count(*) INTO v_total FROM public.jobs WHERE availability_status='active' AND availability_checked_at>now()-interval '24 hours';
  SELECT job_count, locations, sectors INTO v_stats_count, v_locations, v_sectors
    FROM public.catalog_stats WHERE id AND is_valid;
  IF v_stats_count IS DISTINCT FROM v_total OR v_locations IS NULL OR v_sectors IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('loc', location, 'count', cnt) ORDER BY cnt DESC, location), '[]'::jsonb)
      INTO v_locations
      FROM (SELECT location, count(*) AS cnt FROM public.jobs
            WHERE availability_status='active' AND availability_checked_at>now()-interval '24 hours' AND trim(coalesce(location, '')) <> ''
            GROUP BY location ORDER BY cnt DESC, location LIMIT 200) l;
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', employer_sector, 'value', cnt, 'avgMatch', 0)
        ORDER BY CASE employer_sector WHEN 'Other' THEN 1 WHEN 'Uncategorized' THEN 2 ELSE 0 END, cnt DESC, employer_sector), '[]'::jsonb)
      INTO v_sectors
      FROM (SELECT coalesce(cs.sector, 'Uncategorized') AS employer_sector, count(*) AS cnt
            FROM public.jobs j
            LEFT JOIN public.jobpulse_catalog_sectors() cs ON cs.employer_id = j.employer_id
            WHERE j.availability_status='active' AND j.availability_checked_at>now()-interval '24 hours' GROUP BY 1) s;
  END IF;

  WITH evals AS (
    SELECT e.job_id,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights')
      ELSE e.relevance END AS relevance,
      coalesce(nullif(trim(e.ai_analysis->>'role_domain'), ''), 'Uncategorized') AS role_domain,
      CASE WHEN jsonb_typeof(e.matched_skills) = 'array' THEN e.matched_skills ELSE '[]'::jsonb END AS matched_skills
    FROM public.user_job_evaluations e
    JOIN public.jobs j ON j.id = e.job_id AND j.availability_status='active' AND j.availability_checked_at>now()-interval '24 hours'
    JOIN public.user_profiles p ON p.user_id = e.user_id
    WHERE v_effective_uid IS NOT NULL AND e.user_id = v_effective_uid
  ),
  tracked AS (
    SELECT s.status, s.is_saved, s.job_id
    FROM public.user_job_statuses s
    JOIN public.jobs j ON j.id = s.job_id
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
    WHERE ev.relevance IS NOT NULL AND j.availability_status='active' AND j.availability_checked_at>now()-interval '24 hours'
    GROUP BY 1
  ),
  sectors_full AS (
    SELECT s.value->>'name' AS name, (s.value->>'value')::integer AS value, coalesce(sa.avg_match, 0) AS avg_match
    FROM jsonb_array_elements(v_sectors) AS s(value)
    LEFT JOIN sector_avgs sa ON sa.employer_sector = s.value->>'name'
  )
  SELECT jsonb_build_object(
    'total', v_total,
    'availability_counts', (SELECT coalesce(jsonb_object_agg(state,cnt),'{}'::jsonb) FROM
      (SELECT public.jobpulse_availability_status(availability_status,availability_checked_at) AS state, count(*) AS cnt
       FROM public.jobs GROUP BY 1) availability),
    'companies', (SELECT count(*) FROM public.employers),
    'evaluated', (SELECT evaluated FROM totals),
    'locations', v_locations,
    'high_fit', (SELECT count(*) FROM evals WHERE relevance >= 75),
    'counts', (SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) FROM status_counts)
      || jsonb_build_object('new', (SELECT count(*) FROM public.jobs j WHERE j.availability_status='active'
 AND j.availability_checked_at>now()-interval '24 hours' AND NOT EXISTS
 (SELECT 1 FROM public.user_job_statuses s WHERE s.job_id=j.id AND s.user_id=v_effective_uid AND s.status<>'new')))
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

REVOKE ALL ON FUNCTION public.get_active_overview_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_active_overview_metrics() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.persist_crawl_jobs(p_task_id uuid,p_token uuid,p_jobs jsonb)
RETURNS SETOF public.jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE task public.crawl_tasks; item jsonb; vacancy public.jobs; saved public.jobs;
BEGIN
 SELECT * INTO task FROM public.crawl_tasks WHERE id=p_task_id AND lease_token=p_token
 AND status='running' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Crawl lease expired'; END IF;
 IF jsonb_typeof(p_jobs)<>'array' OR jsonb_array_length(p_jobs)>50 OR octet_length(p_jobs::text)>4194304 THEN
  RAISE EXCEPTION 'Invalid crawl batch';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_jobs) LOOP
  vacancy:=jsonb_populate_record(NULL::public.jobs,item->'job');
  INSERT INTO public.jobs(dedupe_key,title,company,location,employment_type,salary_text,description,url,source,
   employer_id,latitude,longitude,coordinate_source,last_seen_at,closed_at)
  VALUES(vacancy.dedupe_key,vacancy.title,vacancy.company,vacancy.location,vacancy.employment_type,
   vacancy.salary_text,vacancy.description,vacancy.url,vacancy.source,vacancy.employer_id,vacancy.latitude,
   vacancy.longitude,vacancy.coordinate_source,now(),NULL)
  ON CONFLICT(dedupe_key) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,
   employment_type=excluded.employment_type,salary_text=excluded.salary_text,
   description=CASE WHEN item->>'work_kind'='detail' AND length(jobs.description)>length(excluded.description)
    THEN jobs.description ELSE excluded.description END,
   url=excluded.url,source=excluded.source,employer_id=coalesce(excluded.employer_id,jobs.employer_id),
   latitude=excluded.latitude,longitude=excluded.longitude,coordinate_source=excluded.coordinate_source,
   last_seen_at=now(),closed_at=CASE WHEN task.target->>'kind'='detail' THEN jobs.closed_at ELSE NULL END RETURNING * INTO saved;
  INSERT INTO public.job_occurrences(job_id,source_key,external_id,source_url,content_hash,snapshot_id)
  VALUES(saved.id,task.source_key,item->>'external_id',saved.url,item->>'content_hash',(item->>'snapshot_id')::uuid)
  ON CONFLICT(source_key,external_id) DO UPDATE SET job_id=excluded.job_id,source_url=excluded.source_url,
   content_hash=excluded.content_hash,last_seen_at=now(),snapshot_id=coalesce(excluded.snapshot_id,job_occurrences.snapshot_id);
  IF item->>'work_kind' IN ('detail','vector') THEN
   PERFORM public.enqueue_crawl((item->>'work_kind') || ':' || saved.id::text,
    jsonb_build_object('kind',item->>'work_kind','job_id',saved.id),20);
  END IF;
  IF coalesce(task.target->>'kind','source') NOT IN ('detail','vector') THEN
   PERFORM public.record_job_availability(saved.id,saved.url,saved.title,'active','published_listing');
   SELECT * INTO saved FROM public.jobs WHERE id=saved.id;
  END IF;
  RETURN NEXT saved;
 END LOOP;
END $$;
