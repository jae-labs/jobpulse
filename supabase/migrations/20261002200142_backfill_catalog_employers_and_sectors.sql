-- Forward migration: Complete backfill of employers, coordinates, and sectors for all catalog jobs
-- Also repairs get_jobs_page so unassessed catalog rows strictly report 'Uncategorized' for tenant safety.

-- 1. Populate employers table with all unique employers from jobs if not already present
INSERT INTO public.employers (name, sector, careers_url, location, latitude, longitude)
SELECT DISTINCT ON (lower(trim(j.company)))
  trim(j.company) AS name,
  CASE
    WHEN j.company ~* '(childcare|creche|montessori|nursery|preschool)' THEN 'Education & Childcare'
    WHEN j.company ~* '(school|college|university|academy|education|training|polytechnic|institute of technology)' THEN 'Higher Education & Training'
    WHEN j.company ~* '(hospital|clinic|healthcare|homecare|care|alzheimers|dementia|medical|nursing|doctor|health|palliative|pharmacy|dental)' THEN 'Healthcare & Community Care'
    WHEN j.company ~* '(pharmaceutical|pharma|biotech|life sciences|therapeutics|biomedical)' THEN 'Life Sciences & Pharma'
    WHEN j.company ~* '(engineering|precision|machining|tooling|welding|metal|fabrication)' THEN 'Engineering & Precision Manufacturing'
    WHEN j.company ~* '(construction|builder|building|plumbing|electrical|roofing|civil engineering|quarry|concrete)' THEN 'Construction & Infrastructure'
    WHEN j.company ~* '(transport|logistics|freight|haulage|courier|delivery|fleet|warehouse|distribution)' THEN 'Transport & Logistics'
    WHEN j.company ~* '(cafe|restaurant|hotel|food|foods|catering|bakery|bar|pub|pantry|inn|pizza|bistro|dining|takeaway|meat|dairy|brewery|beverage)' THEN 'Hospitality, Food & Beverage'
    WHEN j.company ~* '(retail|supermarket|store|grocer|shop|fashion|apparel|deli|boutique|jeweller|florist|optician)' THEN 'Retail & Consumer Goods'
    WHEN j.company ~* '(recruit|recruitment|resourcing|personnel|staffing|employment|manpower|workforce)' THEN 'Recruitment & Staffing'
    WHEN j.company ~* '(community|social|charity|parish|council|clg|association|voluntary|citizens|youth|family|partnership|centre)' THEN 'Public Service & Community'
    WHEN j.company ~* '(finance|financial|bank|capital|fund|asset|wealth|invest|mortgage|credit union|broker)' THEN 'Financial Services & Banking'
    WHEN j.company ~* '(accounting|accountancy|tax|audit|advisory|actuarial)' THEN 'Accounting & Advisory'
    WHEN j.company ~* '(legal|solicitor|law|barrister|attorney|notary)' THEN 'Legal & Compliance'
    WHEN j.company ~* '(aviation|airline|aircraft|aerospace|airport|avionics)' THEN 'Aviation & Aerospace'
    WHEN j.company ~* '(technology|software|tech|cloud|digital|data|cyber|ai|systems|network|computing|developer|telecom|broadband)' THEN 'Software, IT & Technology'
    WHEN j.company ~* '(security|defence|patrol|guard|surveillance|protection)' THEN 'Security & Defence'
    WHEN j.company ~* '(farm|agri|agriculture|equine|animal|veterinary|stud|crop)' THEN 'Agriculture, AgriTech & Veterinary'
    WHEN j.company ~* '(motor|auto|motors|automotive|garage|tyre|car|vehicle)' THEN 'Automotive & Mobility'
    WHEN j.company ~* '(media|print|press|publishing|signs|design|marketing|advertising|digital media)' THEN 'Media, Marketing & Creative'
    WHEN j.company ~* '(energy|power|utility|solar|wind|renewables|water|environment|waste|recycling)' THEN 'Energy, Utilities & Environment'
    ELSE 'Corporate & Commercial Services'
  END AS sector,
  coalesce(nullif(trim(j.url), ''), 'https://jobpulse.dev') AS careers_url,
  coalesce(nullif(trim(j.location), ''), 'Ireland') AS location,
  CASE
    WHEN j.location ~* 'dublin' THEN 53.3498
    WHEN j.location ~* 'cork' THEN 51.8985
    WHEN j.location ~* 'galway' THEN 53.2707
    WHEN j.location ~* 'limerick' THEN 52.6638
    WHEN j.location ~* 'waterford' THEN 52.2593
    WHEN j.location ~* '(naas|kildare|maynooth|leixlip)' THEN 53.2181
    WHEN j.location ~* '(meath|navan)' THEN 53.6528
    WHEN j.location ~* '(wicklow|bray)' THEN 52.9808
    WHEN j.location ~* '(dundalk|drogheda|louth)' THEN 53.7189
    WHEN j.location ~* 'wexford' THEN 52.3369
    WHEN j.location ~* 'kilkenny' THEN 52.6541
    WHEN j.location ~* 'carlow' THEN 52.8365
    WHEN j.location ~* '(laois|portlaoise)' THEN 53.0344
    WHEN j.location ~* '(athlone|westmeath|mullingar)' THEN 53.4239
    WHEN j.location ~* '(offaly|tullamore)' THEN 53.2739
    WHEN j.location ~* 'longford' THEN 53.7275
    WHEN j.location ~* 'roscommon' THEN 53.6325
    WHEN j.location ~* 'sligo' THEN 54.2766
    WHEN j.location ~* '(mayo|castlebar)' THEN 53.8542
    WHEN j.location ~* '(donegal|letterkenny)' THEN 54.9536
    WHEN j.location ~* 'cavan' THEN 53.9908
    WHEN j.location ~* 'monaghan' THEN 54.2492
    WHEN j.location ~* '(clare|shannon|ennis)' THEN 52.7019
    WHEN j.location ~* '(kerry|tralee|killarney)' THEN 52.2713
    WHEN j.location ~* '(tipperary|clonmel)' THEN 52.3556
    ELSE 53.4129
  END AS latitude,
  CASE
    WHEN j.location ~* 'dublin' THEN -6.2603
    WHEN j.location ~* 'cork' THEN -8.4756
    WHEN j.location ~* 'galway' THEN -9.0568
    WHEN j.location ~* 'limerick' THEN -8.6267
    WHEN j.location ~* 'waterford' THEN -7.1101
    WHEN j.location ~* '(naas|kildare|maynooth|leixlip)' THEN -6.6669
    WHEN j.location ~* '(meath|navan)' THEN -6.6814
    WHEN j.location ~* '(wicklow|bray)' THEN -6.0446
    WHEN j.location ~* '(dundalk|drogheda|louth)' THEN -6.3478
    WHEN j.location ~* 'wexford' THEN -6.4633
    WHEN j.location ~* 'kilkenny' THEN -7.2448
    WHEN j.location ~* 'carlow' THEN -6.9341
    WHEN j.location ~* '(laois|portlaoise)' THEN -7.2997
    WHEN j.location ~* '(athlone|westmeath|mullingar)' THEN -7.9407
    WHEN j.location ~* '(offaly|tullamore)' THEN -7.4939
    WHEN j.location ~* 'longford' THEN -7.7932
    WHEN j.location ~* 'roscommon' THEN -8.1883
    WHEN j.location ~* 'sligo' THEN -8.4761
    WHEN j.location ~* '(mayo|castlebar)' THEN -9.2986
    WHEN j.location ~* '(donegal|letterkenny)' THEN -7.7344
    WHEN j.location ~* 'cavan' THEN -7.3606
    WHEN j.location ~* 'monaghan' THEN -6.9683
    WHEN j.location ~* '(clare|shannon|ennis)' THEN -8.9248
    WHEN j.location ~* '(kerry|tralee|killarney)' THEN -9.7026
    WHEN j.location ~* '(tipperary|clonmel)' THEN -7.7039
    ELSE -8.2439
  END AS longitude
FROM public.jobs j
WHERE j.company IS NOT NULL AND trim(j.company) <> ''
ORDER BY lower(trim(j.company)), j.id
ON CONFLICT (name) DO NOTHING;

-- 2. Link all unlinked jobs to their employers record by case-insensitive name
UPDATE public.jobs j
SET employer_id = e.id,
    latitude = COALESCE(j.latitude, e.latitude),
    longitude = COALESCE(j.longitude, e.longitude)
FROM public.employers e
WHERE j.employer_id IS NULL
  AND lower(trim(j.company)) = lower(trim(e.name));

-- 3. Replace candidate evaluations where role_domain was generic 'General' with employer sector
UPDATE public.user_job_evaluations e
SET ai_analysis = jsonb_set(COALESCE(e.ai_analysis, '{}'::jsonb), '{role_domain}', to_jsonb(emp.sector)),
    scoring_version = 'native-sql-v2'
FROM public.jobs j
JOIN public.employers emp ON emp.id = j.employer_id
WHERE e.job_id = j.id
  AND (e.ai_analysis->>'role_domain' = 'General' OR e.ai_analysis->>'role_domain' IS NULL)
  AND emp.sector IS NOT NULL AND emp.sector <> 'General';

-- 4. Overview metrics with employer sector fallback for unevaluated opportunities
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
    SELECT job_id, status
    FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ),
  combined AS (
    SELECT
      e.relevance AS relevance,
      COALESCE(s.status, 'new') AS status,
      COALESCE(
        NULLIF(NULLIF(TRIM(e.ai_analysis->>'role_domain'), ''), 'General'),
        NULLIF(TRIM(emp.sector), ''),
        NULLIF(TRIM(e.ai_analysis->>'role_domain'), ''),
        'Uncategorized'
      ) AS role_domain,
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
    SELECT role_domain, count(*) AS count, coalesce(round(avg(relevance)),0) AS avg_match
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
    'evaluated', (SELECT count(*) FROM combined WHERE relevance IS NOT NULL),
    'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('loc',location,'count',count)), '[]'::jsonb) FROM (
      SELECT location,count(*) AS count FROM combined WHERE trim(coalesce(location,''))<>''
      GROUP BY location ORDER BY count DESC,location LIMIT 200) locations),
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
    ) FROM combined WHERE relevance IS NOT NULL),
    'top_skills', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'skill', skill, 'count', count,
      'percentage', round(count * 100.0 / GREATEST((SELECT count(*) FROM combined WHERE relevance IS NOT NULL), 1))
    ) ORDER BY count DESC, skill), '[]'::jsonb) FROM skill_counts),
    'applied', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'applied'),
    'interviewing', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'interviewing'),
    'interested', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'interested'),
    'not_interested', (SELECT COALESCE(sum(count), 0) FROM status_counts WHERE status = 'not_interested'),
    'by_domain', (SELECT COALESCE(jsonb_object_agg(role_domain, count), '{}'::jsonb) FROM domain_counts)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_overview_metrics"() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."get_overview_metrics"() TO authenticated, service_role;

-- 5. Jobs page query: unassessed rows strictly evaluate to 'Uncategorized' for candidate tenancy
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
  "p_offset" integer DEFAULT 0
) RETURNS "jsonb"
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
  IF coalesce(p_salary,'all') NOT IN ('all','50k','60k','70k','80k','disclosed') OR
     coalesce(p_sort_by,'match') NOT IN ('match','date','salary','title','company','category','location') OR
     coalesce(p_sort_dir,'desc') NOT IN ('asc','desc') OR
     coalesce(p_status,'all') NOT IN ('all','new','applied','interviewing','interested','not_interested') THEN
    RAISE EXCEPTION 'Invalid job filter' USING ERRCODE='22023';
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
    SELECT job_id, status FROM public.user_job_statuses
    WHERE v_effective_uid IS NOT NULL AND user_id = v_effective_uid
  ), combined AS (
    SELECT j.id, j.title, j.company, j.location, j.employment_type, j.salary_text,
      j.salary_min_amount, j.salary_max_amount, j.salary_currency, j.salary_period,
      j.url, j.source, j.employer_id, j.latitude, j.longitude,
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
      CASE WHEN p_sort_by = 'category' AND p_sort_dir = 'desc' THEN role_domain END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'category' AND p_sort_dir <> 'desc' THEN role_domain END ASC NULLS LAST,
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

REVOKE ALL ON FUNCTION "public"."get_jobs_page"("text","text",integer,"text","text","text","text","text",integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."get_jobs_page"("text","text",integer,"text","text","text","text","text",integer,integer) TO authenticated, service_role;

-- 6. Advance scoring generation so candidate background queues remain synchronized
UPDATE public.scoring_catalog_generation SET generation = generation + 1 WHERE id;
