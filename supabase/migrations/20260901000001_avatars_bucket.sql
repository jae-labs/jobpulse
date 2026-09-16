-- Migration: Create avatars storage bucket with public read, owner write RLS
-- Bucket: avatars (public read for serving avatar URLs in UI)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,         -- public: avatar URLs are served directly, no signed URL needed
  2097152,      -- 2MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: Authenticated users can read all avatars (public bucket)
CREATE POLICY "Public read access on avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- RLS: Authenticated users can upload/update their own avatar path only
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND name LIKE (lower(auth.jwt() ->> 'email') || '/%')
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND name LIKE (lower(auth.jwt() ->> 'email') || '/%')
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND name LIKE (lower(auth.jwt() ->> 'email') || '/%')
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (SELECT public.is_authorized_user())
    AND name LIKE (lower(auth.jwt() ->> 'email') || '/%')
  );
