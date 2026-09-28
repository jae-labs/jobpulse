-- Historical aliases are migrated without losing terms or explicit empty lists.
\set ON_ERROR_STOP on
BEGIN;
UPDATE public.user_profiles SET scoring_rules = '{
  "positive_domains":[{"name":"Engineering","keywords":["Python"],"patterns":["Go","Python"],"note":"Preserved note"}],
  "negative_domains":[{"name":"Excluded","patterns":["UI"],"reason":"Preserved reason"}],
  "seniority_tiers":[{"name":"Senior","patterns":["Lead"],"score_weight":0.8}],
  "irish_language_patterns":["Irish"],"weights":{"semantic":0}
}' WHERE user_id = '11111111-1111-1111-1111-111111111111';
\ir ../migrations/20260928220212_canonicalize_profile_scoring_rules.sql
DO $$
DECLARE rules jsonb := (SELECT scoring_rules FROM public.user_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111');
BEGIN
  IF rules#>'{positive_domains,0,keywords}' <> '["Python","Go"]'::jsonb
    OR rules#>>'{positive_domains,0,note}' <> 'Preserved note'
    OR rules#>>'{negative_domains,0,reason}' <> 'Preserved reason'
    OR rules#>>'{seniority_tiers,0,score_weight}' <> '0.8'
    OR rules->'disqualifiers' <> '["Irish"]'::jsonb OR rules ? 'irish_language_patterns'
    OR (rules#>'{positive_domains,0}') ? 'patterns' THEN
    RAISE EXCEPTION 'Historical scoring rules were not preserved and canonicalized: %', rules;
  END IF;
END;
$$;
UPDATE public.user_profiles SET scoring_rules = '{"disqualifiers":[],"irish_language_patterns":["Irish"]}'
WHERE user_id = '11111111-1111-1111-1111-111111111111';
\ir ../migrations/20260928220212_canonicalize_profile_scoring_rules.sql
DO $$
BEGIN
  IF (SELECT scoring_rules->'disqualifiers' FROM public.user_profiles
      WHERE user_id = '11111111-1111-1111-1111-111111111111') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Cleared dealbreakers were restored';
  END IF;
END;
$$;
ROLLBACK;
