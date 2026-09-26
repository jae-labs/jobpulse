-- Email addresses are reusable; only the immutable Auth UID may authorize
-- avatar metadata reads. Legacy email-path objects must be owner-reviewed and
-- migrated through the Storage API before this policy is deployed.
DROP POLICY IF EXISTS "Users can read own avatar metadata" ON storage.objects;
CREATE POLICY "Users can read own avatar metadata" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'avatars' AND (SELECT public.is_authorized_user())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
