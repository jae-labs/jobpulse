-- Function recreation restores PostgreSQL's PUBLIC execute default. Browser
-- access remains authenticated-only; service role keeps scraper access.
REVOKE ALL ON FUNCTION public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_job_map(text,text,integer,text,text,text,double precision[],integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_map(text,text,integer,text,text,text,double precision[],integer) TO authenticated, service_role;
