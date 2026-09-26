-- Clean up old revoked invitations from database
DELETE FROM public.authorized_users WHERE status = 'revoked';

-- Update check constraint on status: only 'pending' and 'accepted'
ALTER TABLE public.authorized_users
  DROP CONSTRAINT IF EXISTS authorized_users_status_check;

ALTER TABLE public.authorized_users
  ADD CONSTRAINT authorized_users_status_check
  CHECK (status IN ('pending', 'accepted'));

-- RPC: create_invitation (if already pending, returns existing valid invitation link without error)
CREATE OR REPLACE FUNCTION public.create_invitation(
  target_email text,
  target_role text DEFAULT 'member'
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

-- RPC: delete_invitation (physically deletes pending invitation from database)
CREATE OR REPLACE FUNCTION public.delete_invitation(
  invitation_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  WHERE id = invitation_id;

  IF invite_row.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF invite_row.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot delete an active member account';
  END IF;

  -- Physically remove the pending invitation row
  DELETE FROM public.authorized_users
  WHERE id = invitation_id AND status = 'pending';

  RETURN json_build_object('success', true, 'id', invitation_id);
END;
$$;

-- Backward compatibility: revoke_invitation performs delete_invitation
CREATE OR REPLACE FUNCTION public.revoke_invitation(
  invitation_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.delete_invitation(invitation_id);
END;
$$;

-- Update trigger for binding verified accounts
CREATE OR REPLACE FUNCTION public.bind_verified_invitation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND NEW.email IS NOT NULL THEN
    UPDATE public.authorized_users
    SET user_id = NEW.id,
        status = 'accepted',
        accepted_at = coalesce(accepted_at, clock_timestamp())
    WHERE email = lower(NEW.email)
      AND (user_id IS NULL OR user_id = NEW.id)
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.delete_invitation(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invitation(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_invitation(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(bigint) TO authenticated;
