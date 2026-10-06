-- Keep enriched employer labels intact; expose a bounded, shared browsing taxonomy.
-- Internal helpers are called by the existing authorized RPCs, never by the browser.
CREATE FUNCTION public.jobpulse_sector_group(p_sector text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT CASE
    WHEN s = '' OR s IN ('uncategorized','unclassified / miscellaneous','general','unknown') THEN 'Uncategorized'
    WHEN s ~ 'community employment' THEN 'Community Employment & Training'
    -- Recruiters stay recruiters even when their clients work in healthcare or IT.
    WHEN s ~ 'recruit|staffing|human resources|^hr[ ,&]|talent|workforce' THEN 'Recruitment & Staffing'
    WHEN s ~ 'public sector|public service|government|regulatory' THEN 'Public Sector & Government'
    WHEN s ~ 'pharma|biotech|biopharma|life science|clinical research' THEN 'Pharmaceuticals & Life Sciences'
    WHEN s ~ 'medical device|medical technology|medtech' THEN 'Medical Devices'
    WHEN s ~ 'insurance|risk advisory' THEN 'Insurance'
    WHEN s ~ 'health|nursing|home care|social care|eldercare|rehabilitation|disability' THEN 'Healthcare & Social Care'
    WHEN s ~ 'education|childcare|early childhood|edtech|learning|training|higher ed' THEN 'Education & Training'
    WHEN s ~ 'cybersecurity|security workflow|identity|access management|vulnerability|data protection' THEN 'Cybersecurity'
    WHEN s ~ 'fintech|financial|banking|payment|investment|fund services|crypto|credit rating' THEN 'Financial Services'
    WHEN s ~ 'telecommunication' THEN 'Telecommunications'
    WHEN s ~ 'software|saas|cloud|artificial intelligence|^ai |data|platform|semiconductor|hardware|electronic design|automation|networking|crm|observability|work management|connected workspace|email delivery|audio tech|feature management|digital signature|communications technology|marketing technology' THEN 'Technology & Software'
    WHEN s ~ 'aviation|aerospace|aircraft' THEN 'Aviation & Aerospace'
    WHEN s ~ 'automotive|vehicle|motor trade' THEN 'Automotive'
    WHEN s ~ 'energy|utilities|electricity|power generation|natural gas|cleantech' THEN 'Energy & Utilities'
    WHEN s ~ 'agriculture|farming|agribusiness|horticulture|animal|veterinary|pet care' THEN 'Agriculture & Animal Care'
    WHEN s ~ 'food|beverage|nutrition|dairy' AND s !~ 'hospitality|catering|restaurant|food service' THEN 'Food & Beverage'
    WHEN s ~ 'retail|commerce|consumer goods|fmcg|cosmetics|wholesale' THEN 'Retail & E-commerce'
    WHEN s ~ 'hospitality|hotel|tourism|travel|restaurant|catering|food service|accommodation' THEN 'Hospitality & Tourism'
    WHEN s ~ 'logistics|transport|freight|supply chain|distribution|postal' THEN 'Transport & Logistics'
    WHEN s ~ 'real estate|property' THEN 'Real Estate'
    WHEN s ~ 'facilit|workplace|business support|consumer services|personal care|equipment hire' THEN 'Facilities & Support Services'
    WHEN s ~ 'construction|civil|structural|building|architecture|engineering|water|wastewater' THEN 'Construction & Engineering'
    WHEN s ~ 'manufactur|industrial|machinery|fabrication|materials|mining|metal|printing|packaging' THEN 'Manufacturing & Industry'
    WHEN s ~ 'environment|waste|recycling' THEN 'Environmental Services'
    WHEN s ~ 'non-profit|nonprofit|non profit|community|social services|humanitarian|religious|charit|advocacy|volunteering' THEN 'Non-Profit & Community'
    WHEN s ~ 'media|entertainment|gaming|games|esports|film|ticketing|culture|heritage|events|sports|fitness' THEN 'Media, Culture & Leisure'
    WHEN s ~ 'professional|consult|accounting|legal|advisory|marketing|advertising|branding|research' THEN 'Professional Services'
    WHEN s ~ 'technology|^it ' THEN 'Technology & Software'
    ELSE 'Other'
  END FROM (SELECT lower(btrim(coalesce(p_sector,''))) AS s) normalized;
$$;
REVOKE ALL ON FUNCTION public.jobpulse_sector_group(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.jobpulse_catalog_sectors()
RETURNS TABLE (employer_id bigint, sector text)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH employer_groups AS MATERIALIZED (
    SELECT e.id, CASE WHEN e.metadata_source IN ('curated','watchlist','verified')
      THEN public.jobpulse_sector_group(e.sector) ELSE 'Uncategorized' END AS sector
    FROM public.employers e
  ), top_sectors AS (
    SELECT g.sector FROM public.jobs j
    JOIN employer_groups g ON g.id=j.employer_id
    WHERE g.sector NOT IN ('Other','Uncategorized')
    GROUP BY g.sector ORDER BY count(*) DESC, g.sector COLLATE "C" LIMIT 20
  )
  SELECT g.id, CASE WHEN g.sector='Uncategorized' THEN g.sector
    WHEN t.sector IS NOT NULL THEN g.sector ELSE 'Other' END
  FROM employer_groups g LEFT JOIN top_sectors t ON t.sector=g.sector;
$$;
REVOKE ALL ON FUNCTION public.jobpulse_catalog_sectors() FROM PUBLIC, anon, authenticated;

-- Preserve authorization, owner-scoped joins, pagination and map logic verbatim.
-- Guard the replacement so a changed upstream contract fails the migration.
DO $migration$
DECLARE
  signature regprocedure;
  definition text;
  original text;
  sector_expression text := $expression$CASE WHEN emp.metadata_source IN ('curated','watchlist','verified')
        THEN coalesce(nullif(trim(emp.sector),''),'Uncategorized') ELSE 'Uncategorized' END$expression$;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_overview_metrics()'::regprocedure,
    'public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer)'::regprocedure,
    'public.get_job_map(text,text,integer,text,text,text,double precision[],integer)'::regprocedure
  ] LOOP
    original := pg_get_functiondef(signature);
    IF strpos(original, sector_expression)=0 OR strpos(original, 'WITH user_evals AS (')=0 THEN
      RAISE EXCEPTION 'Unexpected catalog sector contract in %', signature;
    END IF;
    definition := replace(original, 'WITH user_evals AS (',
      'WITH catalog_sectors AS MATERIALIZED (SELECT * FROM public.jobpulse_catalog_sectors()), user_evals AS (');
    definition := replace(definition, sector_expression, $expression$coalesce(catalog_sector.sector,'Uncategorized')$expression$);
    definition := replace(definition, 'LEFT JOIN public.employers emp ON emp.id = j.employer_id',
      'LEFT JOIN public.employers emp ON emp.id = j.employer_id
    LEFT JOIN catalog_sectors catalog_sector ON catalog_sector.employer_id = j.employer_id');
    definition := replace(definition, 'ORDER BY count DESC, employer_sector',
      'ORDER BY CASE employer_sector WHEN ''Other'' THEN 1 WHEN ''Uncategorized'' THEN 2 ELSE 0 END, count DESC, employer_sector');
    definition := replace(definition, 'ORDER BY count DESC, role_domain',
      'ORDER BY CASE role_domain WHEN ''Other'' THEN 1 WHEN ''Uncategorized'' THEN 2 ELSE 0 END, count DESC, role_domain');
    -- Old saved URLs can still filter by their exact trusted enrichment label.
    definition := replace(definition,
      '(p_sector IS NULL OR p_sector = ''all'' OR c.employer_sector = p_sector)',
      '(p_sector IS NULL OR p_sector = ''all'' OR c.employer_sector = p_sector OR
        (p_sector NOT IN (''Other'',''Uncategorized'') AND EXISTS (
          SELECT 1 FROM public.employers legacy WHERE legacy.id=c.employer_id
          AND legacy.metadata_source IN (''curated'',''watchlist'',''verified'') AND btrim(legacy.sector)=p_sector)))');
    EXECUTE definition;
  END LOOP;
END $migration$;
