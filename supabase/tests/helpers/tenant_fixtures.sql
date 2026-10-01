-- Synthetic identities, no seed or production account dependency. Transaction rollback removes all fixtures.
INSERT INTO auth.users (id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
VALUES
 ('a1111111-1111-4111-8111-111111111111','authenticated','authenticated','tenant-a@example.invalid',now(),'{}','{}'),
 ('b2222222-2222-4222-8222-222222222222','authenticated','authenticated','tenant-b@example.invalid',now(),'{}','{}'),
 ('c3333333-3333-4333-8333-333333333333','authenticated','authenticated','uninvited@example.invalid',now(),'{}','{}'),
 ('d4444444-4444-4444-8444-444444444444','authenticated','authenticated','unconfirmed@example.invalid',NULL,'{}','{}');
INSERT INTO public.authorized_users (email,user_id,role,status) VALUES
 ('tenant-a@example.invalid','a1111111-1111-4111-8111-111111111111','member','accepted'),
 ('tenant-b@example.invalid','b2222222-2222-4222-8222-222222222222','member','accepted');
INSERT INTO public.authorized_users(email,role,status,invited_by) VALUES
 ('pending-a@example.invalid','member','pending','a1111111-1111-4111-8111-111111111111'),
 ('pending-b@example.invalid','member','pending','b2222222-2222-4222-8222-222222222222'),
 ('unconfirmed@example.invalid','member','pending',NULL);
-- Leave an existing Auth identity without a profile to exercise a foreign INSERT without unique-key masking.
DELETE FROM public.user_profiles WHERE user_id='c3333333-3333-4333-8333-333333333333';
INSERT INTO public.user_profiles(user_id,name) VALUES
 ('a1111111-1111-4111-8111-111111111111','Tenant A'),
 ('b2222222-2222-4222-8222-222222222222','Tenant B')
ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO public.jobs(id,dedupe_key,title,company,description,url,source) VALUES
 (-910001,'tenant-guard-job-one','TenantGuardVacancy','Fixture','Fixture','https://example.invalid/1','test'),
 (-910002,'tenant-guard-job-two','TenantGuardVacancy','Fixture','Fixture','https://example.invalid/2','test');
INSERT INTO public.user_job_statuses(user_id,job_id,status) VALUES
 ('a1111111-1111-4111-8111-111111111111',-910001,'applied'),
 ('b2222222-2222-4222-8222-222222222222',-910001,'interviewing');
INSERT INTO public.user_job_evaluations(user_id,job_id,relevance,matched_skills,ai_analysis) VALUES
 ('a1111111-1111-4111-8111-111111111111',-910001,11,'["private-marker-a"]','{"role_domain":"private-marker-a"}'),
 ('b2222222-2222-4222-8222-222222222222',-910001,97,'["private-marker-b"]','{"role_domain":"private-marker-b"}');
INSERT INTO public.user_cvs(user_id,file_name,storage_path) VALUES
 ('a1111111-1111-4111-8111-111111111111','fixture.pdf','a1111111-1111-4111-8111-111111111111/cv/fixture.pdf'),
 ('b2222222-2222-4222-8222-222222222222','fixture.pdf','b2222222-2222-4222-8222-222222222222/cv/fixture.pdf');
INSERT INTO public.user_cover_letters(user_id,file_name,storage_path) VALUES
 ('a1111111-1111-4111-8111-111111111111','fixture.pdf','a1111111-1111-4111-8111-111111111111/cover-letter/fixture.pdf'),
 ('b2222222-2222-4222-8222-222222222222','fixture.pdf','b2222222-2222-4222-8222-222222222222/cover-letter/fixture.pdf');
INSERT INTO storage.objects(bucket_id,name)
SELECT 'user-documents',storage_path FROM public.user_cvs WHERE user_id IN
 ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222')
UNION ALL SELECT 'avatars',u || '/avatar' FROM unnest(ARRAY[
 'a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222']) u;
-- Capture INSERT payloads before switching roles, so the test cannot pass by selecting zero foreign rows.
CREATE TEMP TABLE tenant_insert_payloads(table_name text PRIMARY KEY,payload jsonb NOT NULL);
DO $$ DECLARE t text; p jsonb; BEGIN
 FOR t IN SELECT table_name FROM tenant_contract WHERE access_kind='owner' LOOP
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE user_id=$1',t) INTO p
    USING 'b2222222-2222-4222-8222-222222222222'::uuid;
  INSERT INTO tenant_insert_payloads VALUES(t,p || '{"id":-910099}');
 END LOOP;
END $$;
GRANT SELECT ON tenant_insert_payloads TO authenticated;
