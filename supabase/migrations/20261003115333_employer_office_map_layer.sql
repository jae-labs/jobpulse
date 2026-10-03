-- An optional company-office layer never substitutes posting coordinates.
ALTER TABLE public.employer_office_lookups ADD COLUMN office_place_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(office_place_ids)='array');
CREATE OR REPLACE FUNCTION public.save_employer_office_lookup(p_record jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
REVOKE ALL ON FUNCTION public.save_employer_office_lookup(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_employer_office_lookup(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_job_map(
 p_status text DEFAULT 'all', p_domain text DEFAULT 'all', p_min_match integer DEFAULT 0,
 p_location text DEFAULT 'all', p_salary text DEFAULT 'all', p_search text DEFAULT NULL,
 p_bounds double precision[] DEFAULT ARRAY[-180,-90,180,90]::double precision[], p_zoom integer DEFAULT 3
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_effective_uid uuid; v_search_pattern text; v_grid double precision; result jsonb;
BEGIN
 IF NOT public.is_authorized_user() AND auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Access denied: user is not authorized'; END IF;
 v_effective_uid:=auth.uid();
 IF coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','saved','interested','not_interested')
  OR coalesce(p_salary,'all') NOT IN ('all','50k','60k','70k','80k','disclosed')
  OR length(coalesce(p_domain,''))>100 OR length(coalesce(p_search,''))>80 OR length(coalesce(p_location,''))>80
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
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END AS domain,
      coalesce(nullif(trim(e.ai_analysis->>'role_domain'), ''), 'Uncategorized') AS role_domain,
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
      AND (p_domain IS NULL OR p_domain = 'all' OR c.employer_sector = p_domain)
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
  min(title) AS title,min(company) AS company,min(domain) AS domain,'company_office'::text AS precision
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
  min(title) AS title,min(company) AS company,min(domain) AS domain,
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
