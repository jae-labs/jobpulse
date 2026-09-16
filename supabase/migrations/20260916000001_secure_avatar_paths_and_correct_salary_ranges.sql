-- Keep public avatar delivery, but never grant anonymous object listing and
-- compare the owning path segment exactly rather than with SQL LIKE.
DROP POLICY IF EXISTS "Public read access on avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Users can read own avatar metadata" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND storage.foldername(name)[1] = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND storage.foldername(name)[1] = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND storage.foldername(name)[1] = lower(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND storage.foldername(name)[1] = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND storage.foldername(name)[1] = lower(auth.jwt() ->> 'email')
  );

-- Repair normalized values from the source text. Ranges use both endpoints;
-- a single disclosed amount remains both the minimum and maximum.
WITH extracted AS (
  SELECT id,
    regexp_match(lower(salary_text), '([0-9]{2,3})\\s*k\\D+([0-9]{2,3})\\s*k') AS range_thousands,
    regexp_match(salary_text, '([0-9]{2,3}),([0-9]{3})\\D+([0-9]{2,3}),([0-9]{3})') AS range_comma,
    regexp_match(lower(salary_text), '([0-9]{2,3})\\s*k') AS single_thousands,
    regexp_match(salary_text, '([0-9]{2,3}),([0-9]{3})') AS single_comma
  FROM public.jobs
  WHERE salary_text IS NOT NULL
)
UPDATE public.jobs job
SET salary_min_amount = COALESCE(
      CASE WHEN extracted.range_thousands IS NOT NULL THEN extracted.range_thousands[1]::integer * 1000 END,
      CASE WHEN extracted.range_comma IS NOT NULL THEN (extracted.range_comma[1] || extracted.range_comma[2])::integer END,
      CASE WHEN extracted.single_thousands IS NOT NULL THEN extracted.single_thousands[1]::integer * 1000 END,
      CASE WHEN extracted.single_comma IS NOT NULL THEN (extracted.single_comma[1] || extracted.single_comma[2])::integer END
    ),
    salary_max_amount = COALESCE(
      CASE WHEN extracted.range_thousands IS NOT NULL THEN extracted.range_thousands[2]::integer * 1000 END,
      CASE WHEN extracted.range_comma IS NOT NULL THEN (extracted.range_comma[3] || extracted.range_comma[4])::integer END,
      CASE WHEN extracted.single_thousands IS NOT NULL THEN extracted.single_thousands[1]::integer * 1000 END,
      CASE WHEN extracted.single_comma IS NOT NULL THEN (extracted.single_comma[1] || extracted.single_comma[2])::integer END
    )
FROM extracted
WHERE job.id = extracted.id;
