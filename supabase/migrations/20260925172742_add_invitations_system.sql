-- Add invitations and access policies to authorized_users
ALTER TABLE public.authorized_users
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS authorized_users_invite_code_key
  ON public.authorized_users (invite_code) WHERE invite_code IS NOT NULL;

-- Backfill existing claimed users to 'accepted'
UPDATE public.authorized_users
SET status = 'accepted', accepted_at = coalesce(accepted_at, created_at)
WHERE user_id IS NOT NULL;

-- Backfill existing seed admin (admin@example.com) to have an invite_code if needed
UPDATE public.authorized_users
SET invite_code = pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
WHERE invite_code IS NULL;

-- Update is_authorized_user() to require status = 'accepted'
CREATE OR REPLACE FUNCTION public.is_authorized_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users invitation
    JOIN auth.users account ON account.id = invitation.user_id
    WHERE invitation.user_id = (SELECT auth.uid())
      AND invitation.status = 'accepted'
      AND account.email_confirmed_at IS NOT NULL
  );
$$;

-- Helper function: for backward compatibility, all authorized users share equal access
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_authorized_user();
$$;

-- Update trigger for binding verified invitations upon user signup/confirmation
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
      AND status != 'revoked';
  END IF;
  RETURN NEW;
END;
$$;

-- Update trigger for binding verified invitations when row is inserted/updated
CREATE OR REPLACE FUNCTION public.bind_existing_verified_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT account.id INTO NEW.user_id
    FROM auth.users account
    WHERE lower(account.email) = NEW.email
      AND account.email_confirmed_at IS NOT NULL
    LIMIT 1;
    IF NEW.user_id IS NOT NULL THEN
      NEW.status := 'accepted';
      NEW.accepted_at := coalesce(NEW.accepted_at, clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Update RLS on authorized_users:
-- Active authorized users can view all invitations / team members.
-- Users can view their own authorization row.
DROP POLICY IF EXISTS "Users can only check own authorization" ON public.authorized_users;
DROP POLICY IF EXISTS "Users read own authorization or invitations" ON public.authorized_users;

CREATE POLICY "Users read own authorization or invitations" ON public.authorized_users
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_authorized_user())
  );

-- RPC: create_invitation
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
  SELECT id, status INTO existing_id, existing_status
  FROM public.authorized_users
  WHERE email = clean_email;

  IF existing_id IS NOT NULL THEN
    IF existing_status = 'accepted' THEN
      RAISE EXCEPTION 'User with email % is already an active member', clean_email;
    ELSIF existing_status = 'pending' THEN
      RAISE EXCEPTION 'An invitation for % is already pending', clean_email;
    ELSE
      -- Previously revoked: re-issue
      new_invite_code := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
      UPDATE public.authorized_users
      SET status = 'pending',
          role = 'member',
          invited_by = caller_id,
          invite_code = new_invite_code,
          created_at = clock_timestamp(),
          accepted_at = NULL,
          user_id = NULL
      WHERE id = existing_id
      RETURNING id INTO res_id;

      RETURN json_build_object(
        'success', true,
        'id', res_id,
        'email', clean_email,
        'role', 'member',
        'invite_code', new_invite_code,
        'status', 'pending'
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
    'status', 'pending'
  );
END;
$$;

-- RPC: revoke_invitation
CREATE OR REPLACE FUNCTION public.revoke_invitation(
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
    RAISE EXCEPTION 'Cannot revoke an accepted invitation';
  END IF;

  UPDATE public.authorized_users
  SET status = 'revoked'
  WHERE id = invitation_id;

  RETURN json_build_object('success', true, 'id', invitation_id);
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.create_invitation(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_invitation(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(bigint) TO authenticated;
