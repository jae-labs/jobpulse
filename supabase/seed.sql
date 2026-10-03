-- Synthetic catalog fixtures for fresh local development only.
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
    description, url, source, last_seen_at
) VALUES
    (101, 'job-seed-101', 'Staff Cloud Platform Engineer', 'Stripe', 'Dublin', 'Permanent', '€110,000 - €135,000',
     'Lead cloud infrastructure initiatives, scale multi-region Kubernetes clusters, and build self-service developer tooling.',
     'https://stripe.com/jobs/101', 'LinkedIn Ireland',
     NOW()),

    (102, 'job-seed-102', 'Principal DevOps Architect', 'Workday', 'Dublin', 'Permanent', '€120,000 - €145,000',
     'Architect continuous delivery pipelines and enterprise infrastructure automation at scale using Terraform and AWS.',
     'https://workday.com/jobs/102', 'IrishJobs',
     NOW() - INTERVAL '2 hours'),

    (103, 'job-seed-103', 'Senior Site Reliability Engineer', 'HubSpot', 'Dublin', 'Permanent', '€95,000 - €115,000',
     'Ensure ultra-high availability, optimize observability with Datadog and Grafana, and automate incident remediations.',
     'https://hubspot.com/jobs/103', 'LinkedIn Ireland',
     NOW() - INTERVAL '5 hours'),

    (104, 'job-seed-104', 'Lead Kubernetes Infrastructure Engineer', 'Mastercard', 'Dublin', 'Permanent', '€100,000 - €125,000',
     'Drive global Kubernetes adoption and harden secure cloud transit networks across hybrid environments.',
     'https://mastercard.com/jobs/104', 'IrishJobs',
     NOW() - INTERVAL '1 day'),

    (105, 'job-seed-105', 'Senior Platform Systems Engineer', 'Intercom', 'Dublin', 'Permanent', '€90,000 - €110,000',
     'Build platform services and internal developer abstractions that accelerate product engineering velocity.',
     'https://intercom.com/jobs/105', 'LinkedIn Ireland',
     NOW() - INTERVAL '1 day'),

    (106, 'job-seed-106', 'Staff Infrastructure Security Engineer', 'Datadog', 'Remote, Ireland', 'Permanent', '€115,000 - €140,000',
     'Harden zero-trust networking, container runtime security, and automated cloud identity governance.',
     'https://datadoghq.com/jobs/106', 'LinkedIn Ireland',
     NOW() - INTERVAL '2 days'),

    (107, 'job-seed-107', 'Senior Backend Distributed Systems Engineer', 'Toast', 'Dublin', 'Permanent', '€90,000 - €112,000',
     'Design and implement high-throughput transaction processing pipelines in Java and Kotlin on AWS.',
     'https://toasttab.com/jobs/107', 'IrishJobs',
     NOW() - INTERVAL '3 days'),

    (108, 'job-seed-108', 'Staff Software Engineer - Developer Productivity', 'Slack', 'Dublin', 'Permanent', '€110,000 - €130,000',
     'Create rapid feedback build systems and CI pipelines for thousands of engineers globally.',
     'https://slack.com/jobs/108', 'LinkedIn Ireland',
     NOW() - INTERVAL '4 days'),

    (109, 'job-seed-109', 'Senior Cloud Solutions Architect', 'Amazon Web Services', 'Cork', 'Permanent', '€105,000 - €130,000',
     'Partner with enterprise customers to migrate legacy applications to modern resilient serverless and container architectures.',
     'https://amazon.jobs/109', 'Indeed IE',
     NOW() - INTERVAL '5 days'),

    (110, 'job-seed-110', 'Lead DevOps Automation Engineer', 'Analog Devices', 'Limerick', 'Permanent', '€85,000 - €105,000',
     'Automate hardware emulation toolchains and hybrid cloud CI/CD clusters in Limerick technology center.',
     'https://analog.com/jobs/110', 'IrishJobs',
     NOW() - INTERVAL '6 days'),

    (111, 'job-seed-111', 'Principal Machine Learning Infrastructure Engineer', 'Optum', 'Galway', 'Permanent', '€115,000 - €135,000',
     'Scale GPU cluster management and model training pipelines across hybrid health informatics networks.',
     'https://optum.com/jobs/111', 'Indeed IE',
     NOW() - INTERVAL '7 days'),

    (112, 'job-seed-112', 'Senior Data Platform Engineer', 'TikTok', 'Dublin', 'Permanent', '€95,000 - €120,000',
     'Operate petabyte-scale distributed data storage and streaming infrastructure with Kafka and Flink.',
     'https://tiktok.com/jobs/112', 'LinkedIn Ireland',
     NOW() - INTERVAL '8 days')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    company = EXCLUDED.company,
    salary_text = EXCLUDED.salary_text;

-- Seed evaluations for the admin user matching the jobs
INSERT INTO public.user_job_evaluations (
    user_id, job_id, relevance, fit_tier, matched_skills, ai_analysis
) VALUES
    ('11111111-1111-1111-1111-111111111111', 101, 96, 'Exceptional Match',
     '["Kubernetes", "Terraform", "AWS", "Go", "Docker"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Staff / Principal","semantic_similarity":0.95,"sub_scores":{"domain":1.0,"semantic":0.96,"competency":1.0,"seniority":1.0,"salary":1.0,"contract":1.0,"target_role":1.0,"location":1.0,"work_mode":1.0,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 102, 93, 'Strong Match',
     '["Terraform", "AWS", "Kubernetes", "CI/CD", "Prometheus"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Staff / Principal","semantic_similarity":0.92,"sub_scores":{"domain":1.0,"semantic":0.92,"competency":0.95,"seniority":1.0,"salary":1.0,"contract":1.0,"target_role":1.0,"location":1.0,"work_mode":1.0,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 103, 91, 'Strong Match',
     '["Kubernetes", "Go", "Observability", "Terraform"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Senior","semantic_similarity":0.89,"sub_scores":{"domain":1.0,"semantic":0.88,"competency":0.9,"seniority":1.0,"salary":1.0,"contract":1.0,"target_role":1.0,"location":1.0,"work_mode":1.0,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 104, 89, 'Strong Match',
     '["Kubernetes", "Docker", "AWS", "Security", "Linux"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Lead / Management","semantic_similarity":0.88,"sub_scores":{"domain":1.0,"semantic":0.84,"competency":0.85,"seniority":1.0,"salary":1.0,"contract":1.0,"target_role":1.0,"location":1.0,"work_mode":1.0,"fixed_term":0,"disqualified":0}}'::jsonb),

    ('11111111-1111-1111-1111-111111111111', 105, 88, 'Strong Match',
     '["AWS", "TypeScript", "Terraform", "Docker"]'::jsonb,
     '{"role_domain":"Cloud & Platform Engineering","seniority_level":"Senior","semantic_similarity":0.87,"sub_scores":{"domain":1.0,"semantic":0.84,"competency":0.8,"seniority":1.0,"salary":1.0,"contract":1.0,"target_role":1.0,"location":1.0,"work_mode":1.0,"fixed_term":0,"disqualified":0}}'::jsonb)
ON CONFLICT (user_id, job_id) DO UPDATE SET
    relevance = EXCLUDED.relevance,
    fit_tier = EXCLUDED.fit_tier,
    matched_skills = EXCLUDED.matched_skills;

-- Seed user job statuses
INSERT INTO public.user_job_statuses (
    user_id, job_id, status
) VALUES
    ('11111111-1111-1111-1111-111111111111', 101, 'new'),
    ('11111111-1111-1111-1111-111111111111', 102, 'new'),
    ('11111111-1111-1111-1111-111111111111', 103, 'interviewing'),
    ('11111111-1111-1111-1111-111111111111', 104, 'applied'),
    ('11111111-1111-1111-1111-111111111111', 105, 'new')
ON CONFLICT (user_id, job_id) DO UPDATE SET
    status = EXCLUDED.status;

-- Seed jobs use explicit IDs. Advance the identity sequence before scraper inserts.
SELECT setval(pg_get_serial_sequence('public.jobs', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.jobs), 1), true);

UPDATE public.user_job_statuses SET is_saved=true WHERE user_id='11111111-1111-1111-1111-111111111111' AND job_id=105;
