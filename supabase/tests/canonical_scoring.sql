-- Shared vacancy facts must never supply another candidate's scoring result.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs'
      AND column_name IN ('relevance', 'fit_tier', 'matched_skills', 'ai_analysis', 'role_domain', 'seniority_level')) THEN
    RAISE EXCEPTION 'Shared jobs still contain candidate scoring fields';
  END IF;
END;
$$;
INSERT INTO public.authorized_users(email, role) VALUES ('candidate-test@example.com', 'user');
INSERT INTO auth.users(id, instance_id, email, role, aud, email_confirmed_at)
VALUES ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
  'candidate-test@example.com', 'authenticated', 'authenticated', now());
INSERT INTO public.user_job_evaluations(user_id, job_id, relevance, fit_tier, matched_skills, ai_analysis)
VALUES ('22222222-2222-2222-2222-222222222222', 102, 95, 'Strong Match', '["PrivateSkill"]',
  '{"role_domain":"Other Candidate Domain","seniority_level":"Other Seniority"}');
UPDATE public.user_job_evaluations
SET relevance = 80, fit_tier = 'Strong Match', matched_skills = '["CanonicalSkill"]',
    ai_analysis = '{"role_domain":"Candidate Domain","seniority_level":"Candidate Seniority"}'
WHERE user_id = '11111111-1111-1111-1111-111111111111' AND job_id = 101;
DELETE FROM public.user_job_evaluations
WHERE user_id = '11111111-1111-1111-1111-111111111111' AND job_id = 102;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);
DO $$
DECLARE item jsonb; metrics jsonb;
BEGIN
  SELECT value INTO item FROM jsonb_array_elements(public.get_jobs_page(p_domain => 'Candidate Domain')->'items');
  IF item IS NULL OR item->>'id' <> '101' OR item->>'relevance' <> '80'
    OR item->>'seniority_level' <> 'Candidate Seniority' THEN
    RAISE EXCEPTION 'Catalog did not use candidate classifications and score: %', item;
  END IF;
  SELECT value INTO item FROM jsonb_array_elements(public.get_jobs_page(p_limit => 100)->'items')
    WHERE value->>'id' = '102';
  IF item IS NULL OR item->>'relevance' <> '0' OR item->>'fit_tier' <> 'Unassessed'
    OR item->'matched_skills' <> '[]'::jsonb OR item->>'role_domain' <> 'General Administration' THEN
    RAISE EXCEPTION 'Missing evaluation was not unassessed: %', item;
  END IF;
  metrics := public.get_overview_metrics();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(metrics->'categories') AS c
    WHERE c->>'name' = 'Candidate Domain' AND c->>'value' = '1' AND c->>'avgMatch' = '80') THEN
    RAISE EXCEPTION 'Overview did not use candidate classifications: %', metrics;
  END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"candidate-test@example.com"}', true);
DO $$
DECLARE item jsonb;
BEGIN
  SELECT value INTO item FROM jsonb_array_elements(public.get_jobs_page(p_domain => 'Other Candidate Domain')->'items');
  IF item IS NULL OR item->>'id' <> '102' OR item->>'relevance' <> '95' THEN
    RAISE EXCEPTION 'Second candidate did not get their own evaluation: %', item;
  END IF;
  IF (public.get_jobs_page(p_domain => 'Candidate Domain')->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Second candidate inherited first candidate classification';
  END IF;
END;
$$;
RESET ROLE;
-- The privileged caller without a candidate identity must receive no scores.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.get_jobs_page(p_limit => 100)->'items') AS item
    WHERE item->>'relevance' <> '0' OR item->>'fit_tier' <> 'Unassessed') THEN
    RAISE EXCEPTION 'Candidate-free catalog inherited another user evaluation';
  END IF;
END;
$$;
ROLLBACK;
