-- Run after `supabase db reset --local` (the seed provides the test account).
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'avatars') THEN
    RAISE EXCEPTION 'avatar bucket is public';
  END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);

UPDATE public.user_profiles SET user_email = 'victim@example.com'
WHERE user_id = '11111111-1111-1111-1111-111111111111';

DO $$
BEGIN
  IF NOT public.is_authorized_user() THEN RAISE EXCEPTION 'verified invite was denied'; END IF;
  IF (SELECT count(*) FROM public.authorized_users) <> 1 THEN RAISE EXCEPTION 'bound invite not visible'; END IF;
  IF (SELECT count(*) FROM public.user_profiles) <> 1 THEN RAISE EXCEPTION 'owner profile unavailable'; END IF;
  IF (SELECT user_email FROM public.user_profiles WHERE user_id = (SELECT auth.uid())) = 'victim@example.com' THEN
    RAISE EXCEPTION 'candidate email was spoofed';
  END IF;
  IF (SELECT count(*) FROM public.user_job_statuses) = 0 THEN RAISE EXCEPTION 'owner statuses unavailable'; END IF;
  IF public.owns_document_object('11111111-1111-1111-1111-111111111111/cv/unreserved.pdf') THEN
    RAISE EXCEPTION 'Storage path without metadata was authorized';
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('user-documents', '11111111-1111-1111-1111-111111111111/cv/unreserved.pdf');
    RAISE EXCEPTION 'unreserved Storage object was inserted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

DO $$
DECLARE i integer;
BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO public.user_cvs (user_id, user_email, file_name, storage_path)
    VALUES (
      '11111111-1111-1111-1111-111111111111', 'admin@example.com',
      'security-test.pdf',
      '11111111-1111-1111-1111-111111111111/cv/security-test-' || i || '.pdf'
    );
  END LOOP;

  IF NOT public.owns_document_object('11111111-1111-1111-1111-111111111111/cv/security-test-1.pdf') THEN
    RAISE EXCEPTION 'reserved Storage path was denied';
  END IF;

  BEGIN
    INSERT INTO public.user_cvs (user_id, user_email, file_name, storage_path)
    VALUES (
      '11111111-1111-1111-1111-111111111111', 'admin@example.com',
      'security-test.pdf', '11111111-1111-1111-1111-111111111111/cv/security-test-11.pdf'
    );
    RAISE EXCEPTION 'CV quota was bypassed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'CV quota was bypassed' THEN RAISE; END IF;
  END;
END;
$$;
ROLLBACK;

BEGIN;
INSERT INTO public.jobs (id, dedupe_key, title, company, location, description, url, source)
VALUES
  (999004, 'security-literal-percent', 'Engineer 100%', 'Example', 'Dublin 100%', '', 'https://example.com/percent', 'test'),
  (999005, 'security-normal-search', 'Engineer ordinary', 'Example', 'Dublin', '', 'https://example.com/ordinary', 'test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);
DO $$
DECLARE ids bigint[];
BEGIN
  SELECT array_agg((item->>'id')::bigint) INTO ids
  FROM jsonb_array_elements((public.get_jobs_page(p_search => '%', p_limit => 100))->'items') AS item;
  IF NOT (999004 = ANY(ids)) OR 999005 = ANY(ids) THEN
    RAISE EXCEPTION 'search wildcard was not literal';
  END IF;
  SELECT array_agg((item->>'id')::bigint) INTO ids
  FROM jsonb_array_elements((public.get_jobs_page(p_location => '%', p_limit => 100))->'items') AS item;
  IF NOT (999004 = ANY(ids)) OR 999005 = ANY(ids) THEN
    RAISE EXCEPTION 'location wildcard was not literal';
  END IF;
  BEGIN
    PERFORM public.get_jobs_page(p_search => repeat('x', 81));
    RAISE EXCEPTION 'unbounded search was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'unbounded search was accepted' THEN RAISE; END IF;
  END;
END;
$$;
ROLLBACK;

BEGIN;
INSERT INTO public.jobs (
  id, dedupe_key, title, company, description, url, source,
  salary_text, salary_min_amount, salary_max_amount, salary_currency, salary_period
) VALUES
  (999001, 'security-salary-eur', 'Salary test EUR', 'Example', '', 'https://example.com/eur', 'test',
   '€90,000 annual', 90000, 90000, 'EUR', 'annual'),
  (999002, 'security-salary-usd', 'Salary test USD', 'Example', '', 'https://example.com/usd', 'test',
   '$90,000 annual', 90000, 90000, 'USD', 'annual'),
  (999003, 'security-salary-hourly', 'Salary test hourly', 'Example', '', 'https://example.com/hourly', 'test',
   '€90,000 per hour', 90000, 90000, 'EUR', 'hourly');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);
DO $$
DECLARE ids bigint[];
BEGIN
  SELECT array_agg((item->>'id')::bigint) INTO ids
  FROM jsonb_array_elements((public.get_jobs_page(p_salary => '50k', p_limit => 100))->'items') AS item;
  IF NOT (999001 = ANY(ids)) THEN RAISE EXCEPTION 'annual EUR salary excluded'; END IF;
  IF 999002 = ANY(ids) OR 999003 = ANY(ids) THEN
    RAISE EXCEPTION 'other currency or period included in annual EUR filter';
  END IF;
END;
$$;
ROLLBACK;

BEGIN;
UPDATE auth.users SET email_confirmed_at = NULL
WHERE id = '11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@example.com"}', true);
DO $$
BEGIN
  IF public.is_authorized_user() THEN RAISE EXCEPTION 'unverified account was authorized'; END IF;
  IF (SELECT count(*) FROM public.jobs) <> 0 THEN RAISE EXCEPTION 'unverified account saw jobs'; END IF;
END;
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
-- Same email with a different Auth ID must not inherit an invitation or data.
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"admin@example.com"}', true);
DO $$
BEGIN
  IF public.is_authorized_user() THEN RAISE EXCEPTION 'reused email was authorized'; END IF;
  IF (SELECT count(*) FROM public.authorized_users) <> 0 THEN RAISE EXCEPTION 'other invitation visible'; END IF;
  IF (SELECT count(*) FROM public.user_profiles) <> 0 THEN RAISE EXCEPTION 'other profile visible'; END IF;
  IF (SELECT count(*) FROM public.user_job_statuses) <> 0 THEN RAISE EXCEPTION 'other statuses visible'; END IF;
  IF public.owns_document_object('11111111-1111-1111-1111-111111111111/cv/security-test-1.pdf') THEN
    RAISE EXCEPTION 'other document authorized';
  END IF;
END;
$$;
ROLLBACK;
