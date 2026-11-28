-- Count registry employers once, even with multiple or no vacancies, under the
-- existing overview authorization contract. All synthetic fixtures roll back.
RESET ROLE;
INSERT INTO public.employers(id,name,sector,careers_url,metadata_source) VALUES
 (-950001,'CompanyCount Vacancies','Technology & Software','https://example.invalid/company-count/1','verified'),
 (-950002,'CompanyCount No Vacancies','Technology & Software','https://example.invalid/company-count/2','verified');
UPDATE public.jobs SET employer_id=-950001 WHERE id IN (-910001,-910002);
CREATE TEMP TABLE company_count_expected AS SELECT count(*) AS companies FROM public.employers;
GRANT SELECT ON company_count_expected TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  caller uuid;
  metrics jsonb;
  expected bigint := (SELECT companies FROM company_count_expected);
  foreign_marker text;
BEGIN
  FOREACH caller IN ARRAY ARRAY[
    'a1111111-1111-4111-8111-111111111111'::uuid,
    'b2222222-2222-4222-8222-222222222222'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller,'role','authenticated')::text,true);
    metrics := public.get_overview_metrics();
    IF jsonb_typeof(metrics->'companies') IS DISTINCT FROM 'number'
      OR (metrics->>'companies')::bigint IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Company count must equal the full employer registry for each authorized member';
    END IF;
    foreign_marker := CASE WHEN caller='a1111111-1111-4111-8111-111111111111'::uuid
      THEN 'private-marker-b' ELSE 'private-marker-a' END;
    IF strpos(metrics::text,foreign_marker)>0 THEN
      RAISE EXCEPTION 'Shared company count leaked another member private metrics';
    END IF;
  END LOOP;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","user_metadata":{"sub":"a1111111-1111-4111-8111-111111111111"}}',true);
DO $$ BEGIN
  BEGIN PERFORM public.get_overview_metrics(); RAISE EXCEPTION 'Uninvited/forged company count access';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
DO $$ BEGIN
  BEGIN PERFORM public.get_overview_metrics(); RAISE EXCEPTION 'Unconfirmed company count access';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.get_overview_metrics(); RAISE EXCEPTION 'Anonymous company count access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
