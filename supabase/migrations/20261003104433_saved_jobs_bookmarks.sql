-- Saved is an owner-only bookmark, independent of application progress.
ALTER TABLE public.user_job_statuses ADD COLUMN is_saved boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.user_job_statuses.is_saved IS 'Owner-only job bookmark. Included in account export and removed on account deletion.';
UPDATE public.user_job_statuses SET is_saved=true,status='new' WHERE status='interested';
CREATE INDEX user_job_statuses_saved_owner_idx ON public.user_job_statuses(user_id,job_id) WHERE is_saved;
-- Compatibility for older deployed clients and old status links.
CREATE FUNCTION public.normalize_saved_job_status() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='interested' THEN NEW.status:='new'; NEW.is_saved:=true; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.normalize_saved_job_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER normalize_saved_job_status BEFORE INSERT OR UPDATE ON public.user_job_statuses
FOR EACH ROW EXECUTE FUNCTION public.normalize_saved_job_status();
ALTER TABLE public.user_job_statuses ADD CONSTRAINT user_job_statuses_pipeline_check
CHECK(status IN ('new','applied','interviewing','not_interested'));
CREATE FUNCTION public.set_job_saved(p_job_id bigint,p_saved boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid();
BEGIN
 IF owner_id IS NULL OR NOT public.is_authorized_user() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_saved IS NULL THEN RAISE EXCEPTION 'Saved state is required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.user_job_statuses(user_id,job_id,status,is_saved) VALUES(owner_id,p_job_id,'new',p_saved)
 ON CONFLICT(user_id,job_id) DO UPDATE SET is_saved=excluded.is_saved,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.set_job_saved(bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_job_saved(bigint,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION "public"."get_overview_metrics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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
    SELECT e.job_id,
      CASE WHEN e.ai_analysis ? 'sub_scores' THEN
        public.score_from_subscores(e.ai_analysis->'sub_scores', p.scoring_rules->'weights')
      ELSE e.relevance END AS relevance,
      e.matched_skills, e.ai_analysis
    FROM public.user_job_evaluations e
    JOIN public.user_profiles p ON p.user_id=e.user_id
    WHERE v_effective_uid IS NOT NULL AND e.user_id = v_effective_uid
  ),
  user_stats AS (
    SELECT job_id, status, is_saved
    FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ),
  combined AS (
    SELECT
      e.relevance AS relevance,
      COALESCE(s.status, 'new') AS status, coalesce(s.is_saved,false) AS is_saved,
      coalesce(nullif(trim(e.ai_analysis->>'role_domain'), ''), 'Uncategorized') AS role_domain,
      CASE WHEN emp.metadata_source IN ('curated','watchlist','verified')
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END AS employer_sector,
      j.location, COALESCE(e.matched_skills, '[]'::jsonb) AS matched_skills
    FROM public.jobs j
    LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN user_evals e ON e.job_id = j.id
    LEFT JOIN user_stats s ON s.job_id = j.id
  ),
  status_counts AS (
    SELECT status, count(*) AS count, coalesce(round(avg(relevance)),0) AS avg_match
    FROM combined
    GROUP BY status
  ),
  domain_counts AS (
    SELECT employer_sector AS role_domain, count(*) AS count, coalesce(round(avg(relevance)),0) AS avg_match
    FROM combined
    GROUP BY employer_sector
  ),
  sector_counts AS (
    SELECT employer_sector, count(*) AS count, coalesce(round(avg(relevance)),0) AS avg_match
    FROM combined GROUP BY employer_sector
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
    'evaluated', (SELECT count(*) FROM combined WHERE relevance IS NOT NULL),
    'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('loc',location,'count',count)), '[]'::jsonb) FROM (
      SELECT location,count(*) AS count FROM combined WHERE trim(coalesce(location,''))<>''
      GROUP BY location ORDER BY count DESC,location LIMIT 200) locations),
    'high_fit', (SELECT count(*) FROM combined WHERE relevance >= 75),
    'counts', (SELECT COALESCE(jsonb_object_agg(status, count), '{}'::jsonb) FROM status_counts) || jsonb_build_object('saved',(SELECT count(*) FROM combined WHERE is_saved),'interested',(SELECT count(*) FROM combined WHERE is_saved)),
    'stage_averages', (SELECT COALESCE(jsonb_object_agg(status, avg_match), '{}'::jsonb) FROM status_counts) || jsonb_build_object('saved',(SELECT round(avg(relevance)) FROM combined WHERE is_saved AND relevance IS NOT NULL)),
    'categories', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', role_domain, 'value', count, 'avgMatch', avg_match
    ) ORDER BY count DESC, role_domain), '[]'::jsonb) FROM domain_counts),
    'sectors', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', employer_sector, 'value', count, 'avgMatch', avg_match
    ) ORDER BY count DESC, employer_sector),'[]'::jsonb) FROM sector_counts),
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
    ) FROM combined WHERE relevance IS NOT NULL),
    'top_skills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'skill', skill, 'count', count,
      'percentage', round(count * 100.0 / GREATEST((SELECT count(*) FROM combined WHERE relevance IS NOT NULL), 1))
    ) ORDER BY count DESC, skill), '[]'::jsonb) FROM skill_counts),
    'applied', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'applied'),
    'interviewing', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'interviewing'),
    'saved', (SELECT count(*) FROM combined WHERE is_saved),
    'interested', (SELECT count(*) FROM combined WHERE is_saved),
    'not_interested', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'not_interested'),
    'by_domain', (SELECT COALESCE(jsonb_object_agg(role_domain, count), '{}'::jsonb) FROM domain_counts)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_jobs_page"(
  "p_status" "text" DEFAULT 'all'::"text",
  "p_domain" "text" DEFAULT 'all'::"text",
  "p_min_match" integer DEFAULT 0,
  "p_location" "text" DEFAULT 'all'::"text",
  "p_salary" "text" DEFAULT 'all'::"text",
  "p_search" "text" DEFAULT NULL::"text",
  "p_sort_by" "text" DEFAULT 'match'::"text",
  "p_sort_dir" "text" DEFAULT 'desc'::"text",
  "p_limit" integer DEFAULT 40,
  "p_offset" integer DEFAULT 0,
  "p_sector" text DEFAULT 'all'
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
     coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','saved','interested','not_interested') THEN
    RAISE EXCEPTION 'Invalid job filter' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_domain,'')) > 100 OR length(coalesce(p_sector,'')) > 100 THEN
    RAISE EXCEPTION 'Domain filters must be at most 100 characters' USING ERRCODE='22023';
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
