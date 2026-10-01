-- Personal candidate accounts: membership is not blanket access to the invitation directory.
DROP POLICY "Users read own authorization or invitations" ON public.authorized_users;
CREATE POLICY "Users read own authorization or invitations" ON public.authorized_users FOR SELECT TO authenticated
USING(user_id=(SELECT auth.uid()) OR (invited_by=(SELECT auth.uid()) AND (SELECT public.is_authorized_user())));
ALTER TABLE public.authorized_users ALTER COLUMN role SET DEFAULT 'member';
CREATE INDEX IF NOT EXISTS authorized_users_invited_by_idx ON public.authorized_users(invited_by);
CREATE OR REPLACE FUNCTION "public"."create_invitation"("target_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  clean_email text := lower(trim(target_email));
  new_invite_code text;
  res_id bigint;
  existing_status text;
  existing_id bigint;
  existing_code text;
  existing_owner uuid;
BEGIN
  -- 1. Ensure caller is an active, authorized user
  IF caller_id IS NULL OR NOT (SELECT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Unauthorized: only active members can send invitations';
  END IF;

  -- 2. Validate email syntax
  IF clean_email IS NULL OR length(clean_email)>254 OR clean_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address format';
  END IF;

  -- Serialize quota checks and creation for the same issuer.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text || ':invitations',0));
  -- 3. Check existing invitation or user
  SELECT id, status, invite_code, invited_by INTO existing_id, existing_status, existing_code, existing_owner
  FROM public.authorized_users
  WHERE email = clean_email;

  IF existing_id IS NOT NULL THEN
    IF existing_owner IS DISTINCT FROM caller_id THEN
      RAISE EXCEPTION 'Invitation unavailable';
    END IF;
    IF existing_status = 'accepted' THEN
      RAISE EXCEPTION 'User with email % is already an active member', clean_email;
    ELSIF existing_status = 'pending' THEN
      -- Only the issuer may recover an existing pending link.
      RETURN json_build_object(
        'success', true,
        'id', existing_id,
        'email', clean_email,
        'role', 'member',
        'invite_code', existing_code,
        'status', 'pending',
        'already_pending', true
      );
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.authorized_users WHERE invited_by=caller_id AND status='pending')>=100 THEN
    RAISE EXCEPTION 'Pending invitation limit reached';
  END IF;
  -- 4. Create new pending invitation
  new_invite_code := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  INSERT INTO public.authorized_users (email, role, invited_by, invite_code, status)
  VALUES (clean_email, 'member', caller_id, new_invite_code, 'pending')
  RETURNING id INTO res_id;

  RETURN json_build_object(
    'success', true,
    'id', res_id,
    'email', clean_email,
    'role', 'member',
    'invite_code', new_invite_code,
    'status', 'pending',
    'already_pending', false
  );
END;
$_$;


ALTER FUNCTION "public"."create_invitation"("target_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_invitation"("invitation_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  invite_row public.authorized_users%ROWTYPE;
BEGIN
  IF caller_id IS NULL OR NOT (SELECT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO invite_row
  FROM public.authorized_users
  WHERE id = invitation_id AND invited_by=caller_id;

  IF invite_row.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF invite_row.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot delete an active member account';
  END IF;

  -- Physically remove the pending invitation row
  DELETE FROM public.authorized_users
  WHERE id = invitation_id AND status = 'pending' AND invited_by=caller_id;

  RETURN json_build_object('success', true, 'id', invitation_id);
END;
$$;


ALTER FUNCTION "public"."delete_invitation"("invitation_id" bigint) OWNER TO "postgres";


-- Validate before persistence; invalid configuration cannot poison shared ingestion.
CREATE OR REPLACE FUNCTION public.validate_profile_scoring_inputs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rules jsonb:=coalesce(NEW.scoring_rules,'{}'::jsonb); part jsonb; item jsonb; term jsonb; k text; v jsonb;
BEGIN
 IF jsonb_typeof(rules)<>'object' OR octet_length(rules::text)>65536 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid scoring rules';
 END IF;
 FOR k,v IN SELECT * FROM jsonb_each(rules) LOOP
  IF k NOT IN ('weights','positive_domains','negative_domains','seniority_tiers','disqualifiers') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unknown scoring rule';
  END IF;
  IF k='weights' THEN
   IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'Invalid scoring weights' USING ERRCODE='22023'; END IF;
   FOR k,part IN SELECT * FROM jsonb_each(v) LOOP
    IF k NOT IN ('domain','semantic','competency','seniority','salary','contract','target_role_bonus','location_bonus','work_mode_bonus','fixed_term_penalty','disqualification_cap')
      OR jsonb_typeof(part)<>'number' THEN RAISE EXCEPTION 'Invalid scoring weight' USING ERRCODE='22023'; END IF;
    IF part::numeric<0 OR part::numeric>100 THEN RAISE EXCEPTION 'Scoring weight out of range' USING ERRCODE='22023'; END IF;
   END LOOP;
  ELSE
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Invalid scoring rule list' USING ERRCODE='22023'; END IF;
   IF jsonb_array_length(v)>50 THEN RAISE EXCEPTION 'Too many scoring rules' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP
    IF k='disqualifiers' THEN
     IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>128 THEN RAISE EXCEPTION 'Invalid disqualifier' USING ERRCODE='22023'; END IF;
    ELSE
     IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
       OR length(item->>'name')>128 OR jsonb_typeof(item->'keywords') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid domain rule' USING ERRCODE='22023';
     END IF;
     IF jsonb_array_length(item->'keywords')>50 THEN RAISE EXCEPTION 'Too many rule terms' USING ERRCODE='22023'; END IF;
     FOR term IN SELECT * FROM jsonb_array_elements(item->'keywords') LOOP
      IF jsonb_typeof(term)<>'string' OR length(term#>>'{}')>128 THEN RAISE EXCEPTION 'Invalid rule term' USING ERRCODE='22023'; END IF;
     END LOOP;
     IF item ? 'score_weight' THEN
      IF jsonb_typeof(item->'score_weight')<>'number' THEN RAISE EXCEPTION 'Invalid seniority weight' USING ERRCODE='22023'; END IF;
      IF (item->>'score_weight')::numeric<0 OR (item->>'score_weight')::numeric>1 THEN RAISE EXCEPTION 'Seniority weight out of range' USING ERRCODE='22023'; END IF;
     END IF;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF cardinality(NEW.keywords)>100 OR cardinality(NEW.target_roles)>100 OR cardinality(NEW.target_locations)>100
  OR cardinality(NEW.tools_software)>100 OR cardinality(NEW.languages)>100
  OR length(NEW.summary)>20000 OR NEW.salary_min<0 OR NEW.salary_min>10000000 THEN
  RAISE EXCEPTION 'Profile matching inputs exceed limits' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY coalesce(NEW.keywords,'{}') || coalesce(NEW.target_roles,'{}') || coalesce(NEW.target_locations,'{}') || coalesce(NEW.tools_software,'{}') || coalesce(NEW.languages,'{}') LOOP
  IF k IS NULL OR length(k)>128 THEN RAISE EXCEPTION 'Invalid profile term' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_profile_scoring_inputs() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_profile_scoring_inputs BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_scoring_inputs();
-- Neutral defaults: identity and preferences must be supplied by the candidate.
ALTER TABLE public.user_profiles ALTER COLUMN work_authorization SET DEFAULT '', ALTER COLUMN work_mode SET DEFAULT '',
 ALTER COLUMN employment SET DEFAULT '', ALTER COLUMN salary_min SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.save_profile_embedding(
  p_embedding extensions.vector(384), p_content_hash text, p_model_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_authorized_user() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_embedding IS NULL OR extensions.vector_dims(p_embedding)<>384 OR extensions.vector_norm(p_embedding)=0
    OR p_content_hash IS NULL OR p_model_version IS NULL OR length(p_content_hash) <> 64 OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR p_model_version <> 'all-MiniLM-L6-v2:384:v1' THEN
    RAISE EXCEPTION 'Invalid profile embedding metadata';
  END IF;
  INSERT INTO public.profile_scoring_embeddings (user_id, embedding, content_hash, model_version)
  VALUES (auth.uid(), p_embedding, p_content_hash, p_model_version)
  ON CONFLICT (user_id) DO UPDATE SET embedding = EXCLUDED.embedding,
    content_hash = EXCLUDED.content_hash, model_version = EXCLUDED.model_version
  WHERE public.profile_scoring_embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash
     OR public.profile_scoring_embeddings.model_version IS DISTINCT FROM EXCLUDED.model_version;
END;
$$;
REVOKE ALL ON FUNCTION public.save_profile_embedding(extensions.vector,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_embedding(extensions.vector,text,text) TO authenticated;

