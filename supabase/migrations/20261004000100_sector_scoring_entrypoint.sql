CREATE OR REPLACE FUNCTION public.score_job_for_user(
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

REVOKE ALL ON FUNCTION public.score_job_for_user(uuid,bigint,real) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.score_job_for_user(uuid,bigint,real) TO service_role;

DROP FUNCTION IF EXISTS public.evaluate_candidate_job(uuid,bigint,real);
