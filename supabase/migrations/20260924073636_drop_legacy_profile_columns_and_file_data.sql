-- Consolidate duplicate and legacy columns across candidate profile and document tables.

-- 1. Standardize user_profiles on salary_min and drop redundant minimum_salary
UPDATE public.user_profiles
SET salary_min = COALESCE(salary_min, minimum_salary, 50000);

ALTER TABLE public.user_profiles
  ALTER COLUMN salary_min SET DEFAULT 50000,
  ALTER COLUMN salary_min SET NOT NULL,
  DROP COLUMN IF EXISTS minimum_salary;

-- 2. Consolidate redundant education and experience columns
UPDATE public.user_profiles
SET education = COALESCE(NULLIF(education, ''), NULLIF(education_details, ''), NULLIF(highest_education, ''), '');

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS education_details,
  DROP COLUMN IF EXISTS highest_education,
  DROP COLUMN IF EXISTS years_of_experience;

-- 3. Drop unused legacy file_data columns from document tables (storage uses user-documents bucket)
ALTER TABLE public.user_cvs
  DROP COLUMN IF EXISTS file_data;

ALTER TABLE public.user_cover_letters
  DROP COLUMN IF EXISTS file_data;
