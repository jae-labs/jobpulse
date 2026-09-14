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
    crypt('local-dev-password', gen_salt('bf')),
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
