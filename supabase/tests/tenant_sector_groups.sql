-- Shared top-20 sector membership must not depend on loaded pages or candidate data.
RESET ROLE;
CREATE TEMP TABLE sector_probe_labels(label text PRIMARY KEY);
INSERT INTO sector_probe_labels VALUES
 ('Community Employment & Training'),('Recruitment & Staffing'),('Public Sector & Government'),
 ('Pharmaceuticals & Life Sciences'),('Medical Devices'),('Insurance'),('Healthcare & Social Care'),
 ('Education & Training'),('Cybersecurity'),('Financial Services'),('Telecommunications'),
 ('Technology & Software'),('Aviation & Aerospace'),('Automotive'),('Energy & Utilities'),
 ('Agriculture & Animal Care'),('Food & Beverage'),('Retail & E-commerce'),('Hospitality & Tourism'),
 ('Transport & Logistics'),('Real Estate'),('Facilities & Support Services'),('Construction & Engineering'),
 ('Manufacturing & Industry'),('Environmental Services'),('Non-Profit & Community'),
 ('Media, Culture & Leisure'),('Professional Services');
DO $$ BEGIN
 IF public.jobpulse_sector_group('Staffing & Recruitment')<>'Recruitment & Staffing'
   OR public.jobpulse_sector_group('FinTech and Payments')<>'Financial Services'
   OR public.jobpulse_sector_group('fintech & payments')<>'Financial Services'
   OR public.jobpulse_sector_group('Financial services')<>'Financial Services'
   OR public.jobpulse_sector_group('Healthcare Recruitment')<>'Recruitment & Staffing'
   OR public.jobpulse_sector_group('Unclassified / Miscellaneous')<>'Uncategorized'
   OR public.jobpulse_sector_group(NULL)<>'Uncategorized'
   OR EXISTS (SELECT 1 FROM sector_probe_labels WHERE public.jobpulse_sector_group(label)<>label) THEN
   RAISE EXCEPTION 'Sector synonyms or canonical labels did not normalize';
 END IF;
END $$;
INSERT INTO public.employers(id,name,sector,careers_url,metadata_source)
SELECT -940000-row_number() OVER (ORDER BY label),'SectorProbe '||label,label,'https://example.invalid/sector','verified'
FROM sector_probe_labels;
INSERT INTO public.employers(id,name,sector,careers_url,metadata_source) VALUES
 (-941001,'SectorProbe Synonym One','FinTech and Payments','https://example.invalid/sector/1','verified'),
 (-941002,'SectorProbe Synonym Two','fintech & payments','https://example.invalid/sector/2','curated'),
 (-941003,'SectorProbe Unknown','Unclassified / Miscellaneous','https://example.invalid/sector/3','verified'),
 (-941004,'SectorProbe Unverified','Technology','https://example.invalid/sector/4','unverified'),
 (-941005,'SectorProbe Other','Synthetic unmapped industry','https://example.invalid/sector/5','verified');
INSERT INTO public.jobs(id,dedupe_key,title,company,description,url,source,employer_id,location,
 latitude,longitude,coordinate_source,location_verification)
SELECT e.id,'sector-probe-'||e.id,'SectorProbe Vacancy',e.name,'Synthetic vacancy body',
 'https://example.invalid/sector/'||e.id,'test',e.id,'SectorProbe place',0,0,'geocoded',
 '{"status":"verified","location":"SectorProbe place","precision":"city"}'::jsonb
FROM public.employers e WHERE e.id BETWEEN -941005 AND -940001;
-- Make the financial group large enough to test synonym merging independently of seed data.
INSERT INTO public.jobs(id,dedupe_key,title,company,description,url,source,employer_id)
SELECT -942000-n,'sector-probe-finance-'||n,'SectorProbe Finance','SectorProbe',
 'Synthetic vacancy body','https://example.invalid/sector/finance/'||n,'test',
 CASE WHEN n%2=0 THEN -941001 ELSE -941002 END FROM generate_series(1,100) n;
UPDATE public.jobs SET employer_id=-941005 WHERE id IN (-910001,-910002);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
DO $$
DECLARE m jsonb:=public.get_overview_metrics(); category jsonb; page jsonb; map_result jsonb; named integer;
BEGIN
 SELECT count(*) INTO named FROM jsonb_array_elements(m->'sectors') c
 WHERE c->>'name' NOT IN ('Other','Uncategorized');
 IF named<>20 OR jsonb_array_length(m->'sectors')>22 OR m->'categories'<>m->'sectors'
   OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m->'sectors') c WHERE c->>'name'='Other')
   OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m->'sectors') c WHERE c->>'name'='Uncategorized') THEN
   RAISE EXCEPTION 'Overview must expose top 20, Other, and Uncategorized';
 END IF;
 IF (SELECT sum((c->>'value')::integer) FROM jsonb_array_elements(m->'sectors') c)<>(m->>'total')::integer THEN
   RAISE EXCEPTION 'Grouping lost catalog jobs';
 END IF;
 FOR category IN SELECT * FROM jsonb_array_elements(m->'sectors') LOOP
   page:=public.get_jobs_page(p_sector=>category->>'name',p_limit=>1,p_offset=>1000000);
   map_result:=public.get_job_map(p_sector=>category->>'name');
   IF (page->>'total')::integer<>(category->>'value')::integer OR page->'items'<>'[]'::jsonb
     OR (map_result->>'total')::integer<>(category->>'value')::integer THEN
     RAISE EXCEPTION 'Overview, page and map populations diverged for %',category->>'name';
   END IF;
 END LOOP;
 page:=public.get_jobs_page(p_sector=>'Financial Services',p_search=>'SectorProbe');
 IF (page->>'total')::integer<>103 THEN RAISE EXCEPTION 'Synonymous sectors did not merge'; END IF;
 page:=public.get_jobs_page(p_sector=>'FinTech and Payments',p_search=>'SectorProbe');
 IF (page->>'total')::integer<>51 THEN RAISE EXCEPTION 'Existing sector URLs stopped working'; END IF;
 page:=public.get_jobs_page(p_sector=>'Uncategorized',p_search=>'SectorProbe');
 IF (page->>'total')::integer<>2 THEN RAISE EXCEPTION 'Unknown/unverified employers must stay Uncategorized'; END IF;
 page:=public.get_jobs_page(p_sector=>'Other',p_search=>'SectorProbe');
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(page->'items') i WHERE i->>'id'='-941005') THEN
   RAISE EXCEPTION 'Other is not a working filter'; END IF;
 IF (public.get_jobs_page(p_sector=>'Other',p_min_match=>90)->>'total')::integer<>0
   OR (public.get_job_map(p_sector=>'Other',p_min_match=>90)->>'total')::integer<>0
   OR (public.get_jobs_page(p_sector=>'Other',p_status=>'applied')->>'total')::integer<>1 THEN
   RAISE EXCEPTION 'Other leaked another tenant scores/status'; END IF;
 BEGIN PERFORM public.jobpulse_catalog_sectors(); RAISE EXCEPTION 'Internal catalog helper is browser-accessible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.jobpulse_sector_group('Technology'); RAISE EXCEPTION 'Internal normalizer is browser-accessible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
DO $$ BEGIN
 IF (public.get_jobs_page(p_sector=>'Other',p_min_match=>90)->>'total')::integer<>1
   OR (public.get_job_map(p_sector=>'Other',p_min_match=>90)->>'total')::integer<>1
   OR (public.get_jobs_page(p_sector=>'Other',p_status=>'applied')->>'total')::integer<>0 THEN
   RAISE EXCEPTION 'Other did not switch candidate ownership'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","user_metadata":{"sub":"a1111111-1111-4111-8111-111111111111"}}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_sector=>'Other'); RAISE EXCEPTION 'Uninvited/forged sector access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.get_overview_metrics(); RAISE EXCEPTION 'Unconfirmed sector access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_jobs_page(p_sector=>'Other'); RAISE EXCEPTION 'Anonymous sector access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
