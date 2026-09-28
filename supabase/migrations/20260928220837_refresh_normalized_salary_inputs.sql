-- Keep advertised salary facts current for both filtering and scoring.
CREATE OR REPLACE FUNCTION public.normalize_job_salary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lower text;
  v_range_thousands text[];
  v_range_comma text[];
  v_range_plain text[];
  v_single_thousands text[];
  v_single_comma text[];
  v_single_plain text[];
BEGIN
  -- Refresh derived facts when raw pay changes; retain explicitly supplied facts.
  IF TG_OP = 'UPDATE' AND NEW.salary_text IS DISTINCT FROM OLD.salary_text THEN
    IF NEW.salary_min_amount IS NOT DISTINCT FROM OLD.salary_min_amount THEN NEW.salary_min_amount := NULL; END IF;
    IF NEW.salary_max_amount IS NOT DISTINCT FROM OLD.salary_max_amount THEN NEW.salary_max_amount := NULL; END IF;
    IF NEW.salary_currency IS NOT DISTINCT FROM OLD.salary_currency THEN NEW.salary_currency := NULL; END IF;
    IF NEW.salary_period IS NOT DISTINCT FROM OLD.salary_period THEN NEW.salary_period := NULL; END IF;
  END IF;
  IF NEW.salary_text IS NOT NULL AND trim(NEW.salary_text) <> '' THEN
    v_lower := lower(NEW.salary_text);

    -- Currency detection
    IF NEW.salary_currency IS NULL THEN
      IF NEW.salary_text ~ '€' OR v_lower ~ 'eur' THEN
        NEW.salary_currency := 'EUR';
      ELSIF NEW.salary_text ~ '\$' OR v_lower ~ 'usd' THEN
        NEW.salary_currency := 'USD';
      ELSIF NEW.salary_text ~ '£' OR v_lower ~ 'gbp' THEN
        NEW.salary_currency := 'GBP';
      ELSE
        NEW.salary_currency := 'EUR';
      END IF;
    END IF;

    -- Period detection
    IF NEW.salary_period IS NULL THEN
      IF v_lower ~ '\m(hours?|hourly|hr|ph)\M|/hr' THEN
        NEW.salary_period := 'hourly';
      ELSIF v_lower ~ '\m(days?|daily)\M|/day' THEN
        NEW.salary_period := 'daily';
      ELSIF v_lower ~ '\m(months?|monthly|mo)\M|/mo' THEN
        NEW.salary_period := 'monthly';
      ELSIF v_lower ~ '\m(weeks?|weekly)\M|/week' THEN
        NEW.salary_period := 'weekly';
      ELSE
        NEW.salary_period := 'annual';
      END IF;
    END IF;

    -- Extract min and max amounts if not already set
    IF NEW.salary_min_amount IS NULL OR NEW.salary_max_amount IS NULL THEN
      v_range_comma := regexp_match(NEW.salary_text, '([0-9]{2,3}),([0-9]{3})\D+([0-9]{2,3}),([0-9]{3})');
      v_range_thousands := regexp_match(v_lower, '([0-9]{2,3}(?:\.[0-9]+)?)\s*k?\s*(?:-|–|to)\s*[€£$]?\s*([0-9]{2,3}(?:\.[0-9]+)?)\s*k');
      v_range_plain := regexp_match(NEW.salary_text, '([0-9]{5,6})\D+([0-9]{5,6})');
      v_single_comma := regexp_match(NEW.salary_text, '([0-9]{2,3}),([0-9]{3})');
      v_single_thousands := regexp_match(v_lower, '([0-9]{2,3}(?:\.[0-9]+)?)\s*k');
      v_single_plain := regexp_match(NEW.salary_text, '([0-9]{5,6})');

      IF v_range_comma IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, (v_range_comma[1] || v_range_comma[2])::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, (v_range_comma[3] || v_range_comma[4])::integer);
      ELSIF v_range_thousands IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_range_thousands[1]::numeric * 1000);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_range_thousands[2]::numeric * 1000);
      ELSIF v_range_plain IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_range_plain[1]::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_range_plain[2]::integer);
      ELSIF v_single_comma IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, (v_single_comma[1] || v_single_comma[2])::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, (v_single_comma[1] || v_single_comma[2])::integer);
      ELSIF v_single_thousands IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_single_thousands[1]::numeric * 1000);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_single_thousands[1]::numeric * 1000);
      ELSIF v_single_plain IS NOT NULL THEN
        NEW.salary_min_amount := COALESCE(NEW.salary_min_amount, v_single_plain[1]::integer);
        NEW.salary_max_amount := COALESCE(NEW.salary_max_amount, v_single_plain[1]::integer);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
