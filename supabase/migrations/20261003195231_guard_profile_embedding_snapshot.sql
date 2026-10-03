-- Lock the profile and verify its inference inputs atomically with the vector write.
CREATE FUNCTION public.save_profile_embedding_guarded(
  p_expected_user_id uuid, p_profile_snapshot jsonb,
  p_embedding extensions.vector(384), p_content_hash text, p_model_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_snapshot jsonb;
BEGIN
  IF NOT public.is_authorized_user() OR auth.uid() IS NULL
    OR p_expected_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Active account changed' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'headline',coalesce(p.headline,''),'current_role',coalesce(p.current_role,''),
    'summary',coalesce(p.summary,''),'keywords',coalesce(p.keywords,'[]'::jsonb),
    'tools_software',coalesce(p.tools_software,'[]'::jsonb),'languages',coalesce(p.languages,'[]'::jsonb),
    'certifications',coalesce(p.certifications,''),'education',coalesce(p.education,''))
  INTO current_snapshot FROM public.user_profiles p WHERE p.user_id=auth.uid() FOR UPDATE;
  IF current_snapshot IS NULL OR p_profile_snapshot IS DISTINCT FROM current_snapshot THEN
    RAISE EXCEPTION 'Profile changed during inference' USING ERRCODE='40001';
  END IF;
  PERFORM public.save_profile_embedding(p_embedding,p_content_hash,p_model_version);
END $$;
REVOKE ALL ON FUNCTION public.save_profile_embedding_guarded(uuid,jsonb,extensions.vector,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_embedding_guarded(uuid,jsonb,extensions.vector,text,text) TO authenticated;
