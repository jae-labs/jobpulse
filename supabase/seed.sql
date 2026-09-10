-- JobPulse Development Seed File
-- Insert initial development seed records for local Supabase testing

-- Ensure default admin user exists
INSERT INTO public.authorized_users (email, role)
VALUES
    ('admin@example.com', 'admin')
ON CONFLICT (email) DO NOTHING;
