-- Normalize historical JSON aliases once. Keywords and disqualifiers are canonical.
-- The temporary function is not part of the public API or final schema.
CREATE FUNCTION pg_temp.canonical_scoring_rules(rules jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  result jsonb := rules - 'irish_language_patterns';
  category text;
  rule jsonb;
  normalized jsonb;
  terms jsonb;
BEGIN
  IF jsonb_typeof(rules) IS DISTINCT FROM 'object' THEN RETURN rules; END IF;
  IF jsonb_typeof(rules->'disqualifiers') IS DISTINCT FROM 'array' THEN
    result := jsonb_set(result, '{disqualifiers}',
      CASE WHEN jsonb_typeof(rules->'irish_language_patterns') = 'array'
        THEN rules->'irish_language_patterns' ELSE '[]'::jsonb END);
  END IF;
  FOREACH category IN ARRAY ARRAY['positive_domains', 'negative_domains', 'seniority_tiers'] LOOP
    IF jsonb_typeof(rules->category) IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
    normalized := '[]'::jsonb;
    FOR rule IN SELECT value FROM jsonb_array_elements(rules->category) LOOP
      IF jsonb_typeof(rule) = 'object' THEN
        SELECT coalesce(jsonb_agg(term ORDER BY first_position), '[]'::jsonb) INTO terms
        FROM (
          SELECT term, min(position) AS first_position
          FROM jsonb_array_elements(
            (CASE WHEN jsonb_typeof(rule->'keywords') = 'array' THEN rule->'keywords' ELSE '[]'::jsonb END) ||
            (CASE WHEN jsonb_typeof(rule->'patterns') = 'array' THEN rule->'patterns' ELSE '[]'::jsonb END)
          ) WITH ORDINALITY AS entries(term, position)
          WHERE jsonb_typeof(term) = 'string'
          GROUP BY term
        ) AS unique_terms;
        rule := (rule - 'patterns') || jsonb_build_object('keywords', terms);
      END IF;
      normalized := normalized || jsonb_build_array(rule);
    END LOOP;
    result := jsonb_set(result, ARRAY[category], normalized);
  END LOOP;
  RETURN result;
END;
$function$;

UPDATE public.user_profiles
SET scoring_rules = pg_temp.canonical_scoring_rules(scoring_rules)
WHERE scoring_rules IS DISTINCT FROM pg_temp.canonical_scoring_rules(scoring_rules);

DROP FUNCTION pg_temp.canonical_scoring_rules(jsonb);
