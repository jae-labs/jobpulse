-- @tenant-fixtures
-- Shared employer domains and candidate assessments are separate contracts.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.employers(id,name,sector,careers_url,metadata_source)
VALUES(-920101,'Canonical Synthetic Employer','Canonical Shared Sector','https://example.invalid/canonical','verified');
UPDATE public.jobs SET employer_id=-920101 WHERE id IN (-910001,-910002);
SET LOCAL ROLE authenticated;
DO $$
DECLARE caller uuid; expected_score integer; page jsonb; item jsonb; metrics jsonb;
BEGIN
 FOREACH caller IN ARRAY ARRAY['a1111111-1111-4111-8111-111111111111'::uuid,'b2222222-2222-4222-8222-222222222222'::uuid] LOOP
  expected_score:=CASE WHEN caller::text LIKE 'a%' THEN 11 ELSE 97 END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller,'role','authenticated')::text,true);
  page:=public.get_jobs_page(p_domain=>'Canonical Shared Sector');
  SELECT value INTO item FROM jsonb_array_elements(page->'items') WHERE value->>'id'='-910001';
  IF (page->>'total')::integer<>2 OR (item->>'relevance')::integer<>expected_score
    OR item->>'domain'<>'Canonical Shared Sector' THEN
   RAISE EXCEPTION 'Shared domain filter lost caller assessment: %',page;
  END IF;
  IF page::text LIKE '%' || (CASE WHEN caller::text LIKE 'a%' THEN 'private-marker-b' ELSE 'private-marker-a' END) || '%' THEN
   RAISE EXCEPTION 'Foreign assessment leaked through catalog';
  END IF;
  SELECT value INTO item FROM jsonb_array_elements(page->'items') WHERE value->>'id'='-910002';
  IF item IS NULL OR item->>'relevance'<>'0' OR item->>'fit_tier'<>'Unassessed'
    OR item->'matched_skills'<>'[]'::jsonb OR item->>'role_domain'<>'Uncategorized' THEN
   RAISE EXCEPTION 'Missing evaluation was not unassessed: %',item;
  END IF;
  IF (public.get_jobs_page(p_domain=>'private-marker-a')->>'total')::integer<>0 THEN
   RAISE EXCEPTION 'Candidate-private classification became a shared domain';
  END IF;
  metrics:=public.get_overview_metrics();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(metrics->'categories') c
    WHERE c->>'name'='Canonical Shared Sector' AND c->>'value'='2'
      AND (c->>'avgMatch')::integer=expected_score) THEN
   RAISE EXCEPTION 'Shared sector average included unassessed or foreign scores';
  END IF;
 END LOOP;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_jobs_page(p_search=>'TenantGuardVacancy')->'items') item
   WHERE item->>'relevance'<>'0' OR item->>'fit_tier'<>'Unassessed') THEN
  RAISE EXCEPTION 'Candidate-free catalog inherited candidate evaluation';
 END IF;
END $$;
ROLLBACK;
