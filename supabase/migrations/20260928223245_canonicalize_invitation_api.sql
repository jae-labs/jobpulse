-- Invitations create members only; remove the ignored role argument and delete alias.
DROP FUNCTION public.create_invitation(text, text);
DROP FUNCTION public.revoke_invitation(bigint);

CREATE OR REPLACE FUNCTION public.create_invitation(
  target_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  clean_email text := lower(trim(target_email));
  new_invite_code text;
  res_id bigint;
  existing_status text;
  existing_id bigint;
  existing_code text;
BEGIN
  -- 1. Ensure caller is an active, authorized user
  IF caller_id IS NULL OR NOT (SELECT public.is_authorized_user()) THEN
    RAISE EXCEPTION 'Unauthorized: only active members can send invitations';
  END IF;

  -- 2. Validate email syntax
  IF clean_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address format';
  END IF;

  -- 3. Check existing invitation or user
  SELECT id, status, invite_code INTO existing_id, existing_status, existing_code
  FROM public.authorized_users
  WHERE email = clean_email;

  IF existing_id IS NOT NULL THEN
    IF existing_status = 'accepted' THEN
      RAISE EXCEPTION 'User with email % is already an active member', clean_email;
    ELSIF existing_status = 'pending' THEN
      -- If someone else (or same user) already invited this person,
      -- return the existing pending invitation code so they can share the link without collision
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
$$;

REVOKE ALL ON FUNCTION public.create_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(text) TO authenticated;
