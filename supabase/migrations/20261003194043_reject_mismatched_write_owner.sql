-- Never move a stale request's payload into the newly authenticated account.
-- Service-role ingestion keeps its explicit candidate owner. Browser omissions
-- may inherit auth.uid(), but a supplied owner must match the verified JWT.
CREATE OR REPLACE FUNCTION public.set_user_id_from_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF caller IS NULL OR (NEW.user_id IS NOT NULL AND NEW.user_id <> caller) THEN
      RAISE EXCEPTION 'Write owner differs from authenticated account' USING ERRCODE='42501';
    END IF;
    NEW.user_id := caller;
  ELSIF NEW.user_id IS NULL THEN
    NEW.user_id := caller;
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Active Auth user required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
