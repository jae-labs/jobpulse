CREATE OR REPLACE FUNCTION public.validate_profile_scoring_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

-- `sector` is the canonical classification term. Website-domain fields retain
-- their DNS meaning and are deliberately outside this migration.
UPDATE public.user_profiles
SET scoring_rules = jsonb_strip_nulls(
  (scoring_rules - 'positive_domains'::text - 'negative_domains'::text - 'weights'::text) ||
  jsonb_build_object(
    'positive_sectors', scoring_rules->'positive_domains',
    'negative_sectors', scoring_rules->'negative_domains',
    'weights', jsonb_strip_nulls(((scoring_rules->'weights') - 'domain'::text) || jsonb_build_object('sector', scoring_rules->'weights'->'domain'))
  )
)
WHERE scoring_rules ?| ARRAY['positive_domains', 'negative_domains']
   OR coalesce(scoring_rules->'weights', '{}'::jsonb) ? 'domain';

UPDATE public.user_job_evaluations
SET ai_analysis = jsonb_strip_nulls(
  (ai_analysis - 'role_domain'::text - 'sub_scores'::text) ||
  jsonb_build_object(
    'role_sector', ai_analysis->'role_domain',
    'sub_scores', jsonb_strip_nulls(
      ((ai_analysis->'sub_scores') - 'domain'::text - 'negative_domain'::text) ||
      jsonb_build_object('sector', ai_analysis->'sub_scores'->'domain', 'negative_sector', ai_analysis->'sub_scores'->'negative_domain')
    )
  )
)
WHERE ai_analysis ? 'role_domain'
   OR coalesce(ai_analysis->'sub_scores', '{}'::jsonb) ?| ARRAY['domain', 'negative_domain'];

CREATE OR REPLACE FUNCTION public.score_from_subscores(s jsonb, w jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
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
REVOKE ALL ON FUNCTION public.score_from_subscores(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.score_from_subscores(jsonb,jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.get_job_map(text,text,integer,text,text,text,double precision[],integer);
CREATE FUNCTION public.get_job_map(
 p_status text DEFAULT 'all', p_sector text DEFAULT 'all', p_min_match integer DEFAULT 0,
 p_location text DEFAULT 'all', p_salary text DEFAULT 'all', p_search text DEFAULT NULL,
 p_bounds double precision[] DEFAULT ARRAY[-180,-90,180,90]::double precision[], p_zoom integer DEFAULT 3
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_effective_uid uuid; v_search_pattern text; v_grid double precision; result jsonb;
BEGIN
 IF NOT public.is_authorized_user() AND auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Access denied: user is not authorized'; END IF;
 v_effective_uid:=auth.uid();
 IF coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','saved','interested','not_interested','rejected')
  OR coalesce(p_salary,'all') NOT IN ('all','50k','60k','70k','80k','disclosed')
  OR length(coalesce(p_sector,''))>100 OR length(coalesce(p_search,''))>80 OR length(coalesce(p_location,''))>80
  OR p_bounds IS NULL OR array_ndims(p_bounds) IS DISTINCT FROM 1 OR array_lower(p_bounds,1) IS DISTINCT FROM 1
  OR array_position(p_bounds,NULL) IS NOT NULL OR array_length(p_bounds,1) IS DISTINCT FROM 4
  OR NOT (p_bounds[1] BETWEEN -180 AND 180 AND p_bounds[3] BETWEEN -180 AND 180
          AND p_bounds[2] BETWEEN -90 AND 90 AND p_bounds[4] BETWEEN -90 AND 90)
  OR p_bounds[2]>p_bounds[4] OR p_zoom IS NULL OR p_zoom NOT BETWEEN 0 AND 19 THEN
  RAISE EXCEPTION 'Invalid map filter or viewport' USING ERRCODE='22023'; END IF;
 v_grid:=360.0 / power(2,least(p_zoom+5,24));
 v_search_pattern:=public.jobpulse_literal_search_pattern(coalesce(p_search,''));
  WITH user_evals AS (
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
      CASE WHEN emp.metadata_source IN ('curated','watchlist','verified')
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END AS employer_sector,
      CASE WHEN emp.metadata_source IN ('curated','watchlist','verified')
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END AS sector,
      coalesce(nullif(trim(e.ai_analysis->>'role_sector'), ''), 'Uncategorized') AS role_sector,
      e.ai_analysis->>'seniority_level' AS seniority_level, j.last_seen_at, coalesce(e.relevance, 0) AS relevance,
      coalesce(e.fit_tier, 'Unassessed') AS fit_tier,
      coalesce(e.matched_skills, '[]'::jsonb) AS matched_skills,
      coalesce(s.status, 'new') AS status, coalesce(s.is_saved,false) AS is_saved
    FROM public.jobs j
    LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR (p_status IN ('saved','interested') AND c.is_saved) OR c.status = p_status)
      AND (p_sector IS NULL OR p_sector = 'all' OR c.employer_sector = p_sector)
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
END $$;
DROP FUNCTION IF EXISTS public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer,text);
CREATE FUNCTION "public"."get_jobs_page"(
  "p_status" "text" DEFAULT 'all'::"text",
  "p_sector" "text" DEFAULT 'all'::"text",
  "p_min_match" integer DEFAULT 0,
  "p_location" "text" DEFAULT 'all'::"text",
  "p_salary" "text" DEFAULT 'all'::"text",
  "p_search" "text" DEFAULT NULL::"text",
  "p_sort_by" "text" DEFAULT 'match'::"text",
  "p_sort_dir" "text" DEFAULT 'desc'::"text",
  "p_limit" integer DEFAULT 40,
  "p_offset" integer DEFAULT 0
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_caller_role text := auth.role();
  v_effective_uid uuid;
  v_total bigint;
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_search_pattern text;
BEGIN
  IF coalesce(p_salary,'all') NOT IN ('all','50k','60k','70k','80k','disclosed') OR
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

  WITH user_evals AS (
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
      CASE WHEN emp.metadata_source IN ('curated','watchlist','verified')
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END AS employer_sector,
      CASE WHEN emp.metadata_source IN ('curated','watchlist','verified')
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END AS sector,
      coalesce(nullif(trim(e.ai_analysis->>'role_sector'), ''), 'Uncategorized') AS role_sector,
      e.ai_analysis->>'seniority_level' AS seniority_level, j.last_seen_at, coalesce(e.relevance, 0) AS relevance,
      coalesce(e.fit_tier, 'Unassessed') AS fit_tier,
      coalesce(e.matched_skills, '[]'::jsonb) AS matched_skills,
      coalesce(s.status, 'new') AS status, coalesce(s.is_saved,false) AS is_saved
    FROM public.jobs j
    LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR (p_status IN ('saved','interested') AND c.is_saved) OR c.status = p_status)
      AND (p_sector IS NULL OR p_sector = 'all' OR c.employer_sector = p_sector)
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
$$;
CREATE OR REPLACE FUNCTION public.evaluate_candidate_job(
  p_user_id uuid,
  p_job_id bigint,
  p_similarity real
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

REVOKE ALL ON FUNCTION public.evaluate_candidate_job(uuid,bigint,real) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_candidate_job(uuid,bigint,real) TO service_role;
