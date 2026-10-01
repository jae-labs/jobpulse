\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.create_invitation(text,text)') IS NOT NULL
   OR to_regprocedure('public.revoke_invitation(bigint)') IS NOT NULL THEN
   RAISE EXCEPTION 'Obsolete invitation API still exists';
 END IF;
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub',
  (SELECT user_id FROM public.authorized_users WHERE status='accepted' AND user_id IS NOT NULL LIMIT 1),
  'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE first_invite jsonb; repeated_invite jsonb;
BEGIN
 first_invite := public.create_invitation('cleanup-invite@example.com');
 IF first_invite->>'role' <> 'member' OR first_invite->>'status' <> 'pending' THEN
   RAISE EXCEPTION 'Canonical invitation did not create a pending member';
 END IF;
 repeated_invite := public.create_invitation('cleanup-invite@example.com');
 IF repeated_invite->>'invite_code' IS DISTINCT FROM first_invite->>'invite_code' THEN
   RAISE EXCEPTION 'Repeated invitation replaced the pending link';
 END IF;
 PERFORM public.delete_invitation((first_invite->>'id')::bigint);
 IF EXISTS(SELECT 1 FROM public.authorized_users WHERE id=(first_invite->>'id')::bigint) THEN
   RAISE EXCEPTION 'Canonical deletion did not remove pending invitation';
 END IF;
END $$;
ROLLBACK;
