-- @tenant-fixtures
-- Regression coverage for statement-scoped CTEs, empty pages and the browser filter/sort contract.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.jobs(id,dedupe_key,title,company,location,description,url,source,
 salary_text,salary_min_amount,salary_max_amount,salary_currency,salary_period) VALUES
 (-920001,'paging-probe-alpha','PagingProbe Alpha','Fixture','Dublin 100%_exact','','https://example.invalid/paging/1','test','€60,000 annual',60000,60000,'EUR','annual'),
 (-920002,'paging-probe-beta','PagingProbe Beta','Fixture','Cork','','https://example.invalid/paging/2','test','€90,000 annual',90000,90000,'EUR','annual'),
 (-920003,'paging-probe-gamma','PagingProbe Gamma','Fixture','Dublin ordinary','','https://example.invalid/paging/3','test','$100,000 annual',100000,100000,'USD','annual'),
 (-920004,'paging-probe-delta','PagingProbe Delta','Fixture','Hybrid Remote','','https://example.invalid/paging/4','test','€90,000 hourly',90000,90000,'EUR','hourly'),
 (-920005,'paging-probe-epsilon','PagingProbe Epsilon','Fixture','Belfast','','https://example.invalid/paging/5','test',NULL,NULL,NULL,NULL,NULL);
INSERT INTO public.user_job_evaluations(user_id,job_id,relevance,ai_analysis) VALUES
 ('a1111111-1111-4111-8111-111111111111',-920001,10,'{"role_sector":"Zeta"}'),
 ('a1111111-1111-4111-8111-111111111111',-920002,90,'{"role_sector":"Alpha"}');
INSERT INTO public.employers(id,name,sector,careers_url,metadata_source) VALUES
 (-920001,'Paging Zeta Employer','Zeta','https://example.invalid/zeta','verified'),
 (-920002,'Paging Alpha Employer','Alpha','https://example.invalid/alpha','verified');
UPDATE public.jobs SET employer_id=id WHERE id IN (-920001,-920002);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","email":"tenant-a@example.invalid"}',true);
DO $$
DECLARE result jsonb; offset_value integer; seen_ids bigint[]:='{}'; ids bigint[]; salary_filter text; expected bigint[];
BEGIN
 FOR offset_value IN SELECT generate_series(0,4,2) LOOP
  result:=public.get_jobs_page(p_search=>'PagingProbe',p_sort_by=>'title',p_sort_dir=>'asc',p_limit=>2,p_offset=>offset_value);
  IF (result->>'total')::integer<>5 OR (result->>'pageSize')::integer<>2 OR
    (result->>'page')::integer<>offset_value/2+1 OR jsonb_array_length(result->'items')<>least(2,5-offset_value) THEN
   RAISE EXCEPTION 'Paging count/page contract failed at offset %',offset_value;
  END IF;
  SELECT array_agg((value->>'id')::bigint) INTO ids FROM jsonb_array_elements(result->'items');
  IF offset_value=0 AND ids IS DISTINCT FROM ARRAY[-920001,-920002]::bigint[] THEN
   RAISE EXCEPTION 'Title sorting changed the first page';
  END IF;
  seen_ids:=seen_ids || ids;
 END LOOP;
 IF (SELECT count(DISTINCT id) FROM unnest(seen_ids) id)<>5 THEN
  RAISE EXCEPTION 'Paging omitted or repeated a job';
 END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_limit=>2,p_offset=>100);
 IF (result->>'total')::integer<>5 OR result->'items'<>'[]'::jsonb THEN
  RAISE EXCEPTION 'Empty out-of-range page lost the filtered total';
 END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbeNoMatch');
 IF (result->>'total')::integer<>0 OR result->'items'<>'[]'::jsonb THEN
  RAISE EXCEPTION 'Zero-match search did not return an empty page';
 END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_limit=>0,p_offset=>-1);
 IF (result->>'pageSize')::integer<>1 OR (result->>'page')::integer<>1 OR jsonb_array_length(result->'items')<>1 THEN
  RAISE EXCEPTION 'Negative offset/minimum limit was not bounded';
 END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_limit=>1000);
 IF (result->>'pageSize')::integer<>100 THEN RAISE EXCEPTION 'Maximum page size exceeded'; END IF;
 FOREACH salary_filter IN ARRAY ARRAY['50k','60k','70k','80k','disclosed'] LOOP
  expected:=CASE salary_filter
   WHEN 'disclosed' THEN ARRAY[-920004,-920003,-920002,-920001]::bigint[]
   WHEN '50k' THEN ARRAY[-920002,-920001]::bigint[]
   WHEN '60k' THEN ARRAY[-920002,-920001]::bigint[]
   ELSE ARRAY[-920002]::bigint[] END;
  result:=public.get_jobs_page(p_search=>'PagingProbe',p_salary=>salary_filter,p_limit=>100);
  SELECT array_agg((value->>'id')::bigint ORDER BY (value->>'id')::bigint) INTO ids FROM jsonb_array_elements(result->'items');
  IF ids IS DISTINCT FROM expected OR (result->>'total')::integer<>cardinality(expected) THEN
   RAISE EXCEPTION 'Salary filter % returned wrong currency/period/threshold',salary_filter;
  END IF;
 END LOOP;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_location=>'%_',p_limit=>100);
 IF (result->>'total')::integer<>1 OR result->'items'->0->>'id'<>'-920001' THEN
  RAISE EXCEPTION 'Location wildcards were not treated literally';
 END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_sort_by=>'location',p_sort_dir=>'asc');
 IF result->'items'->0->>'id'<>'-920005' THEN RAISE EXCEPTION 'Browser location sort was ignored'; END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_sort_by=>'category',p_sort_dir=>'asc');
 IF result->'items'->0->>'id'<>'-920002' THEN RAISE EXCEPTION 'Browser category sort was ignored'; END IF;
 result:=public.get_jobs_page(p_search=>'PagingProbe',p_min_match=>75,p_sector=>'Alpha');
 IF (result->>'total')::integer<>1 OR result->'items'->0->>'id'<>'-920002' THEN
  RAISE EXCEPTION 'Match/sector filtering lost candidate evaluation';
 END IF;
END $$;
ROLLBACK;
