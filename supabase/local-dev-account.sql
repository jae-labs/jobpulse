-- JobPulse Development Seed File
-- Insert initial development seed records for local Supabase testing

-- Ensure default admin user exists
INSERT INTO public.authorized_users (email, role)
VALUES
    ('admin@example.com', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Local-only developer account used when VITE_SKIP_AUTH=true. This is an
-- ordinary Supabase Auth user, so browser requests retain an authenticated JWT
-- and exercise the same RLS policies as the hosted application.
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'admin@example.com',
    extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Seed default user profile
INSERT INTO public.user_profiles (
    user_id,
    name,
    first_name,
    last_name,
    headline,
    "current_role",
    current_company,
    location,
    target_roles,
    target_locations,
    work_mode,
    salary_min,
    employment,
    education,
    languages,
    tools_software,
    summary,
    keywords
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Alex Mercer',
    'Alex',
    'Mercer',
    'Staff Cloud Platform Engineer | Distributed Systems & Kubernetes',
    'Lead Platform Engineer',
    'Acme Cloud Systems',
    'Dublin, Ireland',
    ARRAY['Staff Platform Engineer', 'Principal Cloud Architect', 'Lead DevOps Engineer', 'Head of Infrastructure'],
    ARRAY['Dublin', 'Cork', 'Remote, Ireland'],
    'Hybrid',
    85000,
    'Permanent only',
    'B.Sc. in Computer Science',
    ARRAY['English', 'Portuguese'],
    ARRAY['Kubernetes', 'Terraform', 'AWS', 'Go', 'TypeScript', 'Docker', 'PostgreSQL', 'Prometheus'],
    'Platform engineer with deep expertise in cloud-native infrastructure, automated reliability, and developer platforms.',
    ARRAY['Kubernetes', 'Terraform', 'AWS', 'GCP', 'Distributed Systems', 'CI/CD', 'Platform Engineering']
) ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name,
    headline = EXCLUDED.headline,
    target_roles = EXCLUDED.target_roles,
    keywords = EXCLUDED.keywords;
