-- Literal skill matching: punctuation is data, and adjacent word characters
-- cannot turn a short skill into a substring of another word.
CREATE FUNCTION public.jobpulse_has_literal_skill(p_text text, p_skill text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
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
REVOKE ALL ON FUNCTION public.jobpulse_has_literal_skill(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jobpulse_has_literal_skill(text,text) TO service_role;

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
        coalesce((s->>'domain')::numeric,0)*coalesce((w->>'domain')::numeric,20) +
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

CREATE OR REPLACE FUNCTION "public"."score_job_for_user"(
  p_user_id uuid,
  p_job_id bigint,
  p_similarity real
) RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = ''
    AS $$
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

CREATE OR REPLACE FUNCTION public.process_candidate_scoring(p_batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

REVOKE ALL ON FUNCTION public.score_job_for_user(uuid,bigint,real) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.process_candidate_scoring(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_candidate_scoring(integer) TO service_role;

-- Update only the exact former defaults; custom priorities remain candidate-owned.
UPDATE public.user_profiles
SET scoring_rules=jsonb_set(jsonb_set(scoring_rules,'{weights,domain}','20'),'{weights,salary}','10')
WHERE scoring_rules->'weights'='{"domain":25,"semantic":25,"competency":20,"seniority":15,"salary":15,"contract":10,"target_role_bonus":6,"location_bonus":4,"work_mode_bonus":2,"fixed_term_penalty":8,"disqualification_cap":10}'::jsonb;

-- Recompute factors once for the algorithm revision, through bounded durable work.
-- Profiles awaiting a fresh vector retain their setup state and old usable results.
UPDATE public.candidate_scoring_work
SET state=CASE WHEN needs_embedding THEN 'awaiting_embedding' ELSE 'pending' END,
 desired_revision=desired_revision+1,completed_fingerprint='',job_ids=NULL,cursor=0,
 attempts=0,retry_at=now(),last_error_code=NULL,updated_at=clock_timestamp();
UPDATE public.scoring_catalog_generation SET generation=generation+1 WHERE id;
