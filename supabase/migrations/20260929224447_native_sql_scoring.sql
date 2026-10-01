-- Keep candidate vectors private. The browser can submit its own vector through a
-- narrow RPC; no Data API role can select vectors or write another user's row.
CREATE INDEX IF NOT EXISTS idx_job_scoring_embeddings_hnsw
  ON public.job_scoring_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.get_profile_embedding_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_authorized_user() THEN
    (SELECT jsonb_build_object('content_hash', content_hash, 'model_version', model_version)
     FROM public.profile_scoring_embeddings WHERE user_id = (SELECT auth.uid()))
  ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.get_profile_embedding_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_embedding_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_profile_embedding(
  p_embedding extensions.vector(384), p_content_hash text, p_model_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_authorized_user() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF length(p_content_hash) <> 64 OR p_content_hash !~ '^[0-9a-f]{64}$'
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
$$;
REVOKE ALL ON FUNCTION public.save_profile_embedding(extensions.vector,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_embedding(extensions.vector,text,text) TO authenticated;

-- Normalized sub-scores make weight-only edits cheap: no regex or vector search.
CREATE OR REPLACE FUNCTION public.score_from_subscores(s jsonb, w jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT least(
    CASE WHEN coalesce((s->>'disqualified')::numeric,0) > 0
      THEN least(greatest(coalesce((w->>'disqualification_cap')::numeric,10),0),15)
      ELSE 100 END,
    greatest(0, least(100, round(
      CASE WHEN coalesce((s->>'negative_domain')::numeric,0) > 0 THEN
        least(15, coalesce((s->>'semantic')::numeric,0)*20 + coalesce((s->>'domain')::numeric,0)*10)
      ELSE
        coalesce((s->>'domain')::numeric,0)*coalesce((w->>'domain')::numeric,25) +
        coalesce((s->>'semantic')::numeric,0)*coalesce((w->>'semantic')::numeric,25) +
        coalesce((s->>'competency')::numeric,0)*coalesce((w->>'competency')::numeric,20) +
        coalesce((s->>'seniority')::numeric,0)*coalesce((w->>'seniority')::numeric,15) +
        coalesce((s->>'salary')::numeric,0)*coalesce((w->>'salary')::numeric,15) +
        coalesce((s->>'contract')::numeric,0)*coalesce((w->>'contract')::numeric,10) +
        coalesce((s->>'target_role')::numeric,0)*coalesce((w->>'target_role_bonus')::numeric,6) +
        coalesce((s->>'location')::numeric,0)*coalesce((w->>'location_bonus')::numeric,4) +
        coalesce((s->>'work_mode')::numeric,0)*coalesce((w->>'work_mode_bonus')::numeric,2) -
        coalesce((s->>'onsite_penalty')::numeric,0)*4 -
        coalesce((s->>'fixed_term')::numeric,0)*coalesce((w->>'fixed_term_penalty')::numeric,8) -
        coalesce((s->>'auth_deduction')::numeric,0)
      END))))::integer;
$$;
REVOKE ALL ON FUNCTION public.score_from_subscores(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_from_subscores(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fit_tier_for_score(p_score integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_score >= 75 THEN 'Strong Match' WHEN p_score >= 55 THEN 'Good Match'
    WHEN p_score >= 35 THEN 'Moderate Match' WHEN p_score >= 15 THEN 'Low Match' ELSE 'Mismatch' END;
$$;
REVOKE ALL ON FUNCTION public.fit_tier_for_score(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fit_tier_for_score(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.score_job_for_user(p_user_id uuid, p_job_id bigint, p_similarity real)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.user_profiles%ROWTYPE;
  j public.jobs%ROWTYPE;
  je public.job_scoring_embeddings%ROWTYPE;
  pe public.profile_scoring_embeddings%ROWTYPE;
  rules jsonb;
  rule jsonb;
  term text;
  full_text text;
  title_text text;
  profile_text text;
  matched jsonb := '[]'::jsonb;
  terms_count integer := 0;
  matched_count integer := 0;
  domain_score numeric := 0.4;
  seniority_score numeric := 0.75;
  salary_score numeric := 0.75;
  contract_score numeric := 0.85;
  domain_name text;
  seniority_name text := 'Professional / Mid-Level';
  negative_domain boolean := false;
  disqualified boolean := false;
  fixed_term boolean;
  target_role boolean := false;
  location_factor numeric := 0;
  mode_match boolean := false;
  onsite_penalty boolean := false;
  auth_deduction numeric := 0;
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
  domain_name := coalesce(nullif(p.headline,''),nullif(p.current_role,''),'General');

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
  ) candidates WHERE trim(value) <> ''
  LOOP
    terms_count := terms_count + 1;
    BEGIN
      IF length(term) <= 100 AND full_text ~* term THEN
        matched_count := matched_count + 1;
        matched := matched || to_jsonb(term);
      END IF;
    EXCEPTION WHEN invalid_regular_expression THEN
      IF position(lower(term) in lower(full_text)) > 0 THEN
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
    now(),je.content_hash,pe.content_hash,'native-sql-v1')
  ON CONFLICT (user_id,job_id) DO UPDATE SET relevance=EXCLUDED.relevance,fit_tier=EXCLUDED.fit_tier,
    matched_skills=EXCLUDED.matched_skills,ai_analysis=EXCLUDED.ai_analysis,calculated_at=EXCLUDED.calculated_at,
    scoring_job_hash=EXCLUDED.scoring_job_hash,scoring_profile_hash=EXCLUDED.scoring_profile_hash,
    scoring_version=EXCLUDED.scoring_version;
END;
$$;
REVOKE ALL ON FUNCTION public.score_job_for_user(uuid,bigint,real) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rescore_user(p_user_id uuid, p_top_k integer DEFAULT 1500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  candidate record;
  updated integer := 0;
  effective_limit integer := least(greatest(coalesce(p_top_k,1500),1),1500);
  target_embedding extensions.vector(384);
BEGIN
  IF auth.role() NOT IN ('service_role') AND
    (auth.uid() IS DISTINCT FROM p_user_id OR NOT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT embedding INTO target_embedding FROM public.profile_scoring_embeddings WHERE user_id=p_user_id;
  IF target_embedding IS NULL THEN RETURN 0; END IF;
  -- ORDER BY the distance expression directly so the HNSW index can serve Top K.
  FOR candidate IN
    SELECT job_id, (1 - (embedding OPERATOR(extensions.<=>) target_embedding))::real AS similarity
    FROM public.job_scoring_embeddings
    WHERE model_version=(SELECT model_version FROM public.profile_scoring_embeddings WHERE user_id=p_user_id)
    ORDER BY embedding OPERATOR(extensions.<=>) target_embedding LIMIT effective_limit
  LOOP
    PERFORM public.score_job_for_user(p_user_id,candidate.job_id,candidate.similarity);
    updated := updated + 1;
  END LOOP;
  DELETE FROM public.user_job_evaluations e WHERE e.user_id=p_user_id
    AND EXISTS (SELECT 1 FROM public.job_scoring_embeddings available WHERE available.job_id=e.job_id)
    AND NOT EXISTS (
      SELECT 1 FROM (SELECT job_id FROM public.job_scoring_embeddings
        WHERE model_version=(SELECT model_version FROM public.profile_scoring_embeddings WHERE user_id=p_user_id)
        ORDER BY embedding OPERATOR(extensions.<=>) target_embedding LIMIT effective_limit) shortlist
      WHERE shortlist.job_id=e.job_id);
  RETURN updated;
END;
$$;
REVOKE ALL ON FUNCTION public.rescore_user(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rescore_user(uuid,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_default_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.user_profiles(user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_default_user_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER create_default_user_profile AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_default_user_profile();
INSERT INTO public.user_profiles(user_id)
SELECT id FROM auth.users ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.score_new_job_embedding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  profile record;
  similarity real;
BEGIN
  FOR profile IN SELECT pe.user_id,pe.embedding FROM public.profile_scoring_embeddings pe
    JOIN public.authorized_users a ON a.user_id=pe.user_id AND a.status='accepted'
  LOOP
    similarity := (1 - (NEW.embedding OPERATOR(extensions.<=>) profile.embedding))::real;
    IF NEW.model_version = (SELECT model_version FROM public.profile_scoring_embeddings WHERE user_id=profile.user_id)
      AND similarity > 0.30 THEN
      PERFORM public.score_job_for_user(profile.user_id,NEW.job_id,similarity);
      DELETE FROM public.user_job_evaluations e WHERE e.id IN (
        SELECT ranked.id FROM (
          SELECT ue.id, row_number() OVER (ORDER BY je.embedding OPERATOR(extensions.<=>) profile.embedding) AS rank
          FROM public.user_job_evaluations ue
          JOIN public.job_scoring_embeddings je ON je.job_id=ue.job_id
          WHERE ue.user_id=profile.user_id AND ue.scoring_version='native-sql-v1'
        ) ranked WHERE ranked.rank > 1500);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.score_new_job_embedding() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER score_new_job_embedding AFTER INSERT OR UPDATE OF embedding ON public.job_scoring_embeddings
FOR EACH ROW EXECUTE FUNCTION public.score_new_job_embedding();

-- Preserve the existing paging API while recomposing from cached sub-scores.
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

-- Catalog maintenance keeps all tenant checks and transfers inside PostgreSQL.
CREATE OR REPLACE FUNCTION public.prune_stale_catalog_jobs(p_retention_days integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE deleted_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_retention_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid retention period'; END IF;
  DELETE FROM public.jobs j
  WHERE j.last_seen_at < now() - make_interval(days => p_retention_days)
    AND NOT EXISTS (SELECT 1 FROM public.user_job_statuses s
      WHERE s.job_id=j.id AND s.status NOT IN ('new','not_interested'));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_stale_catalog_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_stale_catalog_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.merge_duplicate_catalog_jobs(
  p_keeper_id bigint, p_duplicate_ids bigint[], p_dedupe_key text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  INSERT INTO public.user_job_statuses(user_id,job_id,status,updated_at)
  SELECT user_id,p_keeper_id,status,updated_at FROM public.user_job_statuses
  WHERE job_id=ANY(p_duplicate_ids)
  ON CONFLICT (user_id,job_id) DO NOTHING;
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
REVOKE ALL ON FUNCTION public.merge_duplicate_catalog_jobs(bigint,bigint[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_catalog_jobs(bigint,bigint[],text) TO service_role;

DROP FUNCTION public.get_job_scoring_work(jsonb,jsonb,text,text);
