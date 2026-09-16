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

-- Seed default user profile
INSERT INTO public.user_profiles (
    user_id,
    user_email,
    name,
    first_name,
    last_name,
    headline,
    "current_role",
    current_company,
    years_of_experience,
    location,
    target_roles,
    target_locations,
    work_mode,
    minimum_salary,
    salary_min,
    employment,
    education,
    highest_education,
    languages,
    tools_software,
    summary,
    keywords
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'admin@example.com',
    'Alex Mercer',
    'Alex',
    'Mercer',
    'Staff Cloud Platform Engineer | Distributed Systems & Kubernetes',
    'Lead Platform Engineer',
    'Acme Cloud Systems',
    '12+ years',
    'Dublin, Ireland',
    ARRAY['Staff Platform Engineer', 'Principal Cloud Architect', 'Lead DevOps Engineer', 'Head of Infrastructure'],
    ARRAY['Dublin', 'Cork', 'Remote, Ireland'],
    'Hybrid',
    85000,
    85000,
    'Permanent only',
    'B.Sc. in Computer Science',
    'Master''s Degree (QQI Level 9)',
    ARRAY['English', 'Portuguese'],
    ARRAY['Kubernetes', 'Terraform', 'AWS', 'Go', 'TypeScript', 'Docker', 'PostgreSQL', 'Prometheus'],
    'Platform engineer with deep expertise in cloud-native infrastructure, automated reliability, and developer platforms.',
    ARRAY['Kubernetes', 'Terraform', 'AWS', 'GCP', 'Distributed Systems', 'CI/CD', 'Platform Engineering']
) ON CONFLICT (user_email) DO UPDATE SET
    name = EXCLUDED.name,
    headline = EXCLUDED.headline,
    target_roles = EXCLUDED.target_roles,
    keywords = EXCLUDED.keywords;

-- Seed data sources
INSERT INTO public.sources (name, url, mode, last_status, last_synced_at, opportunities_found)
VALUES
    ('IrishJobs', 'https://www.irishjobs.ie', 'feed', 'Healthy', NOW() - INTERVAL '1 hour', 1240),
    ('LinkedIn Ireland', 'https://www.linkedin.com/jobs', 'api', 'Healthy', NOW() - INTERVAL '30 minutes', 2410),
    ('Indeed IE', 'https://ie.indeed.com', 'feed', 'Healthy', NOW() - INTERVAL '2 hours', 890),
    ('PublicJobs.ie', 'https://www.publicjobs.ie', 'feed', 'Healthy', NOW() - INTERVAL '4 hours', 315)
ON CONFLICT (id) DO NOTHING;

-- Seed initial batch of realistic jobs to exercise pagination, search, and charts
INSERT INTO public.jobs (
    id, dedupe_key, title, company, location, employment_type, salary_text,
    description, url, source, relevance, matched_skills, status, role_domain, seniority_level, last_seen_at
) VALUES
    (101, 'job-seed-101', 'Staff Cloud Platform Engineer', 'Stripe', 'Dublin', 'Permanent', '€110,000 - €135,000',
     'Lead cloud infrastructure initiatives, scale multi-region Kubernetes clusters, and build self-service developer tooling.',
     'https://stripe.com/jobs/101', 'LinkedIn Ireland', 96, '["Kubernetes", "Terraform", "AWS", "Go", "Docker"]'::jsonb,
     'new', 'Cloud & Platform Engineering', 'Staff / Principal', NOW()),

    (102, 'job-seed-102', 'Principal DevOps Architect', 'Workday', 'Dublin', 'Permanent', '€120,000 - €145,000',
     'Architect continuous delivery pipelines and enterprise infrastructure automation at scale using Terraform and AWS.',
     'https://workday.com/jobs/102', 'IrishJobs', 93, '["Terraform", "AWS", "Kubernetes", "CI/CD", "Prometheus"]'::jsonb,
     'new', 'Cloud & Platform Engineering', 'Staff / Principal', NOW() - INTERVAL '2 hours'),

    (103, 'job-seed-103', 'Senior Site Reliability Engineer', 'HubSpot', 'Dublin', 'Permanent', '€95,000 - €115,000',
     'Ensure ultra-high availability, optimize observability with Datadog and Grafana, and automate incident remediations.',
     'https://hubspot.com/jobs/103', 'LinkedIn Ireland', 91, '["Kubernetes", "Go", "Observability", "Terraform"]'::jsonb,
     'interviewing', 'Cloud & Platform Engineering', 'Senior', NOW() - INTERVAL '5 hours'),

    (104, 'job-seed-104', 'Lead Kubernetes Infrastructure Engineer', 'Mastercard', 'Dublin', 'Permanent', '€100,000 - €125,000',
     'Drive global Kubernetes adoption and harden secure cloud transit networks across hybrid environments.',
     'https://mastercard.com/jobs/104', 'IrishJobs', 89, '["Kubernetes", "Docker", "AWS", "Security", "Linux"]'::jsonb,
     'applied', 'Cloud & Platform Engineering', 'Lead / Management', NOW() - INTERVAL '1 day'),

    (105, 'job-seed-105', 'Senior Platform Systems Engineer', 'Intercom', 'Dublin', 'Permanent', '€90,000 - €110,000',
     'Build platform services and internal developer abstractions that accelerate product engineering velocity.',
     'https://intercom.com/jobs/105', 'LinkedIn Ireland', 88, '["AWS", "TypeScript", "Terraform", "Docker"]'::jsonb,
     'interested', 'Cloud & Platform Engineering', 'Senior', NOW() - INTERVAL '1 day'),

    (106, 'job-seed-106', 'Staff Infrastructure Security Engineer', 'Datadog', 'Remote, Ireland', 'Permanent', '€115,000 - €140,000',
     'Harden zero-trust networking, container runtime security, and automated cloud identity governance.',
     'https://datadoghq.com/jobs/106', 'LinkedIn Ireland', 86, '["Security", "Kubernetes", "AWS", "Go"]'::jsonb,
     'new', 'Cybersecurity', 'Staff / Principal', NOW() - INTERVAL '2 days'),

    (107, 'job-seed-107', 'Senior Backend Distributed Systems Engineer', 'Toast', 'Dublin', 'Permanent', '€90,000 - €112,000',
     'Design and implement high-throughput transaction processing pipelines in Java and Kotlin on AWS.',
     'https://toasttab.com/jobs/107', 'IrishJobs', 84, '["Java", "Kotlin", "AWS", "Distributed Systems", "PostgreSQL"]'::jsonb,
     'new', 'Software Engineering', 'Senior', NOW() - INTERVAL '3 days'),

    (108, 'job-seed-108', 'Staff Software Engineer - Developer Productivity', 'Slack', 'Dublin', 'Permanent', '€110,000 - €130,000',
     'Create rapid feedback build systems and CI pipelines for thousands of engineers globally.',
     'https://slack.com/jobs/108', 'LinkedIn Ireland', 87, '["TypeScript", "Go", "Docker", "CI/CD", "Kubernetes"]'::jsonb,
     'new', 'Software Engineering', 'Staff / Principal', NOW() - INTERVAL '4 days'),

    (109, 'job-seed-109', 'Senior Cloud Solutions Architect', 'Amazon Web Services', 'Cork', 'Permanent', '€105,000 - €130,000',
     'Partner with enterprise customers to migrate legacy applications to modern resilient serverless and container architectures.',
     'https://amazon.jobs/109', 'Indeed IE', 82, '["AWS", "Cloud Architecture", "Terraform", "Security"]'::jsonb,
     'new', 'Cloud & Platform Engineering', 'Senior', NOW() - INTERVAL '5 days'),

    (110, 'job-seed-110', 'Lead DevOps Automation Engineer', 'Analog Devices', 'Limerick', 'Permanent', '€85,000 - €105,000',
     'Automate hardware emulation toolchains and hybrid cloud CI/CD clusters in Limerick technology center.',
     'https://analog.com/jobs/110', 'IrishJobs', 79, '["Python", "Docker", "Linux", "CI/CD", "Kubernetes"]'::jsonb,
     'new', 'Cloud & Platform Engineering', 'Lead / Management', NOW() - INTERVAL '6 days'),

    (111, 'job-seed-111', 'Principal Machine Learning Infrastructure Engineer', 'Optum', 'Galway', 'Permanent', '€115,000 - €135,000',
     'Scale GPU cluster management and model training pipelines across hybrid health informatics networks.',
     'https://optum.com/jobs/111', 'Indeed IE', 77, '["Kubernetes", "Python", "GPU", "Terraform", "Docker"]'::jsonb,
     'new', 'Data & AI', 'Staff / Principal', NOW() - INTERVAL '7 days'),

    (112, 'job-seed-112', 'Senior Data Platform Engineer', 'TikTok', 'Dublin', 'Permanent', '€95,000 - €120,000',
     'Operate petabyte-scale distributed data storage and streaming infrastructure with Kafka and Flink.',
     'https://tiktok.com/jobs/112', 'LinkedIn Ireland', 75, '["Kafka", "Go", "Kubernetes", "Distributed Systems"]'::jsonb,
     'new', 'Data & AI', 'Senior', NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    company = EXCLUDED.company,
    relevance = EXCLUDED.relevance,
    status = EXCLUDED.status;

-- Seed evaluations for the admin user matching the jobs
INSERT INTO public.user_job_evaluations (
    user_id, user_email, job_id, relevance, fit_tier, matched_skills, ai_analysis
) VALUES
    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 101, 96, 'Exceptional Match',
     '["Kubernetes", "Terraform", "AWS", "Go", "Docker"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Staff / Principal","semantic_similarity":95,"sub_scores":{"domain":25,"semantic":24,"competency":20,"seniority":15,"salary":15,"contract":10,"target_role":6,"location":4,"work_mode":2,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 102, 93, 'Strong Match',
     '["Terraform", "AWS", "Kubernetes", "CI/CD", "Prometheus"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Staff / Principal","semantic_similarity":92,"sub_scores":{"domain":25,"semantic":23,"competency":19,"seniority":15,"salary":15,"contract":10,"target_role":6,"location":4,"work_mode":2,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 103, 91, 'Strong Match',
     '["Kubernetes", "Go", "Observability", "Terraform"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Senior","semantic_similarity":89,"sub_scores":{"domain":25,"semantic":22,"competency":18,"seniority":15,"salary":15,"contract":10,"target_role":6,"location":4,"work_mode":2,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 104, 89, 'Strong Match',
     '["Kubernetes", "Docker", "AWS", "Security", "Linux"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Lead / Management","semantic_similarity":88,"sub_scores":{"domain":25,"semantic":21,"competency":17,"seniority":15,"salary":15,"contract":10,"target_role":6,"location":4,"work_mode":2,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 105, 88, 'Strong Match',
     '["AWS", "TypeScript", "Terraform", "Docker"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Senior","semantic_similarity":87,"sub_scores":{"domain":25,"semantic":21,"competency":16,"seniority":15,"salary":15,"contract":10,"target_role":6,"location":4,"work_mode":2,"fixed_term":0,"disqualified":0}}'::jsonb)
ON CONFLICT (user_email, job_id) DO UPDATE SET
    relevance = EXCLUDED.relevance,
    fit_tier = EXCLUDED.fit_tier,
    matched_skills = EXCLUDED.matched_skills;

-- Seed user job statuses
INSERT INTO public.user_job_statuses (
    user_id, user_email, job_id, status
) VALUES
    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 101, 'new'),
    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 102, 'new'),
    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 103, 'interviewing'),
    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 104, 'applied'),
    ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 105, 'interested')
ON CONFLICT (user_email, job_id) DO UPDATE SET
    status = EXCLUDED.status;
