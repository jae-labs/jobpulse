-- Keep invitation data in the same transaction as Auth user deletion.
-- Candidate rows already reference auth.users(id) ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.purge_deleted_account_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Remove the deleted member's access and unclaimed invitations they issued.
  -- Accepted members remain; their invited_by FK becomes NULL on deletion.
  DELETE FROM public.authorized_users
  WHERE user_id = OLD.id
     OR (invited_by = OLD.id AND status = 'pending');

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_deleted_account_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purge_deleted_account_access ON auth.users;
CREATE TRIGGER purge_deleted_account_access
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.purge_deleted_account_access();
