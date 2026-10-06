-- Forward migration: Support employer sector fallback for domain classification and catalog metrics

-- 1. Candidate scoring domain fallback to employer sector
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
  domain_score numeric := 0.5;
  domain_name text := 'General';
  negative_domain boolean := false;
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
  domain_name := 'General';

  FOR term IN SELECT value FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(rules->'disqualifiers') = 'array' THEN rules->'disqualifiers' ELSE '[]'::jsonb END)
  LOOP
    BEGIN
      IF length(term) BETWEEN 1 AND 100 AND full_text ~* term THEN disqualified := true; EXIT; END IF;
    EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
  END LOOP;

  FOR rule IN SELECT value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(rules->'negative_domains') = 'array' THEN rules->'negative_domains' ELSE '[]'::jsonb END)
  LOOP
    FOR term IN SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(rule->'keywords') = 'array' THEN rule->'keywords' ELSE '[]'::jsonb END)
    LOOP
      BEGIN
        IF length(term) BETWEEN 1 AND 100 AND full_text ~* term AND profile_text !~* term THEN
          negative_domain := true; domain_name := coalesce(rule->>'name','Domain mismatch'); EXIT;
        END IF;
      EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
    END LOOP;
    EXIT WHEN negative_domain;
  END LOOP;
  IF negative_domain THEN domain_score := 0.05;
  ELSE
    FOR rule IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(rules->'positive_domains') = 'array' THEN rules->'positive_domains' ELSE '[]'::jsonb END)
    LOOP
      FOR term IN SELECT value FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(rule->'keywords') = 'array' THEN rule->'keywords' ELSE '[]'::jsonb END)
      LOOP
        BEGIN
          IF length(term) BETWEEN 1 AND 100 AND title_text ~* term THEN
            domain_score := 1; domain_name := coalesce(rule->>'name','Target Domain'); EXIT;
          ELSIF length(term) BETWEEN 1 AND 100 AND full_text ~* term AND domain_score < 0.8 THEN
            domain_score := 0.8; domain_name := coalesce(rule->>'name','Target Domain');
          END IF;
        EXCEPTION WHEN invalid_regular_expression THEN CONTINUE; END;
      END LOOP;
      EXIT WHEN domain_score = 1;
    END LOOP;
  END IF;

  -- Fallback to employer sector if candidate scoring rules did not classify a specific domain
  IF domain_name = 'General' AND j.employer_id IS NOT NULL THEN
    SELECT coalesce(nullif(trim(sector), ''), 'General') INTO domain_name
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
  subs := jsonb_build_object('domain',domain_score,'semantic',least(1,greatest(0,p_similarity)),
    'competency',CASE WHEN terms_count = 0 THEN 0 ELSE least(1,matched_count::numeric / terms_count * 1.5) END,
    'seniority',seniority_score,'salary',salary_score,'contract',contract_score,
    'target_role',CASE WHEN target_role THEN 1 ELSE 0 END,'location',location_factor,
    'work_mode',CASE WHEN mode_match THEN 1 ELSE 0 END,'onsite_penalty',CASE WHEN onsite_penalty THEN 1 ELSE 0 END,
    'fixed_term',CASE WHEN fixed_term AND p.employment = 'Permanent only' THEN 1 ELSE 0 END,
    'auth_deduction',auth_deduction,'negative_domain',CASE WHEN negative_domain THEN 1 ELSE 0 END,
    'disqualified',CASE WHEN disqualified THEN 1 ELSE 0 END);
  score := public.score_from_subscores(subs, rules->'weights');
  INSERT INTO public.user_job_evaluations (user_id,job_id,relevance,fit_tier,matched_skills,ai_analysis,
    calculated_at,scoring_job_hash,scoring_profile_hash,scoring_version)
  VALUES (p_user_id,p_job_id,score,public.fit_tier_for_score(score),matched,
    jsonb_build_object('fit_score',score,'fit_tier',public.fit_tier_for_score(score),
      'role_domain',domain_name,'seniority_level',seniority_name,'salary_fit','',
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

-- 2. Overview metrics with employer sector fallback for unevaluated opportunities
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
        NULLIF(TRIM(e.ai_analysis->>'role_domain'), ''),
        NULLIF(TRIM(emp.sector), ''),
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

-- 3. Jobs page query with employer sector fallback
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
      coalesce(
        nullif(trim(e.ai_analysis->>'role_domain'), ''),
        nullif(trim(emp.sector), ''),
        'Uncategorized'
      ) AS role_domain,
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

-- 4. Advance catalog generation so active candidate shortlists recompute domains
UPDATE public.scoring_catalog_generation SET generation = generation + 1 WHERE id;
