-- Security hardening from a tenant-isolation red-team review.
-- Forward-only: the baseline migration is immutable.

-- 1) Bind user-document object access to the caller's UID prefix in every policy.
-- An application metadata row alone is not a durable ownership proof: the row and
-- its Storage object can diverge (an owner can remove metadata while the object
-- remains), and another member who learns the object key could claim the path and
-- then read, rename or delete the foreign object. The INSERT policy already checks
-- the prefix; SELECT, UPDATE and DELETE must too.

DROP POLICY IF EXISTS "Users can only view own storage documents" ON "storage"."objects";
CREATE POLICY "Users can only view own storage documents" ON "storage"."objects"
    FOR SELECT TO "authenticated"
    USING (("bucket_id" = 'user-documents'::"text")
        AND ("split_part"("name", '/'::"text", 1) = (SELECT "auth"."uid"())::"text")
        AND (SELECT "public"."owns_document_object"("name")));

DROP POLICY IF EXISTS "Users can only update own storage documents" ON "storage"."objects";
CREATE POLICY "Users can only update own storage documents" ON "storage"."objects"
    FOR UPDATE TO "authenticated"
    USING (("bucket_id" = 'user-documents'::"text")
        AND ("split_part"("name", '/'::"text", 1) = (SELECT "auth"."uid"())::"text")
        AND (SELECT "public"."owns_document_object"("name")))
    WITH CHECK (("bucket_id" = 'user-documents'::"text")
        AND ("split_part"("name", '/'::"text", 1) = (SELECT "auth"."uid"())::"text")
        AND (SELECT "public"."owns_document_object"("name")));

DROP POLICY IF EXISTS "Users can only delete own storage documents" ON "storage"."objects";
CREATE POLICY "Users can only delete own storage documents" ON "storage"."objects"
    FOR DELETE TO "authenticated"
    USING (("bucket_id" = 'user-documents'::"text")
        AND ("split_part"("name", '/'::"text", 1) = (SELECT "auth"."uid"())::"text")
        AND (SELECT "public"."owns_document_object"("name")));

-- 2) The raw profile-embedding writer bypasses the guarded snapshot contract.
-- Authenticated members submit vectors only through save_profile_embedding_guarded,
-- which validates the current profile snapshot; the worker/backend path keeps the
-- unguarded writer through service_role.
REVOKE ALL ON FUNCTION "public"."save_profile_embedding"("p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."save_profile_embedding"("p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."save_profile_embedding"("p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."save_profile_embedding"("p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_profile_embedding_guarded"("p_expected_user_id" "uuid", "p_profile_snapshot" "jsonb", "p_embedding" "extensions"."vector", "p_content_hash" "text", "p_model_version" "text") TO "authenticated";

-- 3) Document quota triggers must enforce ownership before counting. When the
-- quota check ran first it counted a supplied foreign owner's rows, so a distinct
-- "Maximum document limit reached" error revealed whether another member was at
-- the 10-document cap. Reject a foreign owner with the same error as
-- set_user_id_from_auth before any per-owner count happens.

CREATE OR REPLACE FUNCTION "public"."check_user_cv_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF auth.uid() IS NULL OR (NEW.user_id IS NOT NULL AND NEW.user_id <> auth.uid()) THEN
      RAISE EXCEPTION 'Write owner differs from authenticated account' USING ERRCODE='42501';
    END IF;
    NEW.user_id := auth.uid();
  ELSIF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF; -- trusted imports of legacy rows
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text || ':cv', 0));
  IF (SELECT count(*) FROM public.user_cvs WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum document limit of 10 CVs reached';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."check_user_cover_letter_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF auth.uid() IS NULL OR (NEW.user_id IS NOT NULL AND NEW.user_id <> auth.uid()) THEN
      RAISE EXCEPTION 'Write owner differs from authenticated account' USING ERRCODE='42501';
    END IF;
    NEW.user_id := auth.uid();
  ELSIF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF; -- trusted imports of legacy rows
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text || ':cover-letter', 0));
  IF (SELECT count(*) FROM public.user_cover_letters WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum document limit of 10 cover letters reached';
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Least-privilege browser grants. Anonymous visitors need no table or sequence
-- access (every read happens behind an authenticated session, and RLS already
-- denies anonymous rows). Authenticated members read shared catalogs and own only
-- their candidate rows; unused DML/Maintain grants are removed so a future
-- mis-scoped policy cannot widen the blast radius.

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon";

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "authenticated";

GRANT SELECT ON TABLE
    "public"."authorized_users",
    "public"."jobs",
    "public"."employers",
    "public"."sources",
    "public"."employer_offices"
    TO "authenticated";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    "public"."user_profiles",
    "public"."user_job_statuses",
    "public"."user_job_evaluations",
    "public"."user_cvs",
    "public"."user_cover_letters"
    TO "authenticated";

GRANT USAGE ON SEQUENCE
    "public"."user_profiles_id_seq",
    "public"."user_job_statuses_id_seq",
    "public"."user_job_evaluations_id_seq",
    "public"."user_cvs_id_seq",
    "public"."user_cover_letters_id_seq"
    TO "authenticated";
