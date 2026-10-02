-- Per-vacancy geocoding evidence is independent of employer headquarters.
ALTER TABLE public.jobs DROP CONSTRAINT jobs_coordinate_source_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_coordinate_source_check CHECK (coordinate_source IS NULL OR coordinate_source IN ('posting','geocoded'));
ALTER TABLE public.jobs ADD COLUMN location_verification jsonb;
COMMENT ON COLUMN public.jobs.location_verification IS 'External vacancy-location lookup: original input, provider, time, status, precision and confidence. No employer headquarters substitution.';

CREATE OR REPLACE FUNCTION public.clear_changed_job_location_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.location IS DISTINCT FROM OLD.location THEN
  NEW.location_verification:=NULL;
  IF OLD.coordinate_source='geocoded' AND NEW.coordinate_source IS DISTINCT FROM 'posting' THEN
   NEW.latitude:=NULL; NEW.longitude:=NULL; NEW.coordinate_source:=NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clear_changed_job_location_verification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clear_changed_job_location_verification BEFORE UPDATE OF location ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.clear_changed_job_location_verification();

CREATE OR REPLACE FUNCTION public.apply_job_location_verifications(p_records jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
REVOKE ALL ON FUNCTION public.apply_job_location_verifications(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_job_location_verifications(jsonb) TO service_role;

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
 IF coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','interested','not_interested')
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
    SELECT job_id, status FROM public.user_job_statuses
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
      coalesce(s.status, 'new') AS status
    FROM public.jobs j
    LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id
  ), filtered AS (
    SELECT * FROM combined c WHERE
      (p_status IS NULL OR p_status = 'all' OR c.status = p_status)
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
  ), located AS (
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
  'pins',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM bounded b),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_job_map(text,text,integer,text,text,text,double precision[],integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_job_map(text,text,integer,text,text,text,double precision[],integer) TO authenticated,service_role;
