-- Extend both existing catalog RPCs to annual EUR thresholds of 10k–300k.
-- Keep compatibility with all/disclosed and preserve existing tenant guards and grants.
DO $migration$
DECLARE signature text; original text; updated text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_jobs_page(text,text,integer,text,text,text,text,text,integer,integer,text)',
    'public.get_job_map(text,text,integer,text,text,text,double precision[],integer)'
  ] LOOP
    original := pg_get_functiondef(signature::regprocedure);
    IF strpos(original, $guard$coalesce(p_salary,'all') NOT IN ('all','50k','60k','70k','80k','disclosed')$guard$) = 0
      OR strpos(original, $terms$(p_salary = '50k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 50000) OR
          (p_salary = '60k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 60000) OR
          (p_salary = '70k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 70000) OR
          (p_salary = '80k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 80000)$terms$) = 0 THEN
      RAISE EXCEPTION 'Unexpected salary contract in %', signature;
    END IF;
    updated := replace(original, $guard$coalesce(p_salary,'all') NOT IN ('all','50k','60k','70k','80k','disclosed')$guard$, $guard$(coalesce(p_salary,'all') NOT IN ('all','disclosed') AND coalesce(p_salary,'all') !~ '^(?:[1-9]|[12][0-9]|30)0k$')$guard$);
    updated := replace(updated, $terms$(p_salary = '50k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 50000) OR
          (p_salary = '60k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 60000) OR
          (p_salary = '70k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 70000) OR
          (p_salary = '80k' AND coalesce(c.salary_max_amount, c.salary_min_amount) >= 80000)$terms$, $terms$coalesce(c.salary_max_amount, c.salary_min_amount) >=
          CASE WHEN p_salary ~ '^(?:[1-9]|[12][0-9]|30)0k$'
            THEN split_part(p_salary, 'k', 1)::integer * 1000 END$terms$);
    EXECUTE updated;
  END LOOP;
END $migration$;
