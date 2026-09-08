export const STATUS_LIST = [
  'new',
  'applied',
  'interviewing',
  'offer',
  'not_interested',
] as const;

export type JobStatus = (typeof STATUS_LIST)[number];

export interface AiAnalysis {
  fit_score: number;
  fit_tier: string;
  score_emoji?: string;
  reasoning?: string;
  role_domain: string;
  seniority_level: string;
  salary_fit: string;
  alignments: string[];
  mismatch_flags: string[];
  matched_skills: string[];
  semantic_similarity: number;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  salary_text: string | null;
  description: string;
  url: string;
  source: string;
  relevance: number;
  matched_skills: string[];
  fit_tier?: string;
  role_domain?: string;
  seniority_level?: string;
  ai_analysis?: AiAnalysis;
  status: JobStatus;
  last_seen_at: string;
}

export interface Source {
  id: number;
  name: string;
  url: string;
  mode: string;
  last_status: string;
  last_synced_at: string | null;
  detail: string | null;
  vacancies_found?: number | null;
}

export interface Employer {
  id: number;
  name: string;
  sector: string;
  priority: number;
  careers_url: string;
  discovered_jobs_url?: string | null;
  status?: string | null;
  last_scraped_at?: string | null;
  vacancies_found?: number | null;
}

export interface Profile {
  name?: string;
  first_name?: string;
  last_name?: string;
  headline: string;
  location: string;
  minimum_salary: number;
  salary_min?: number;
  salary_max?: number;
  employment?: string;
  education?: string;
  highest_education?: string;
  education_details?: string;
  certifications?: string;
  current_role?: string;
  current_company?: string;
  years_of_experience?: string;
  experience_level?: string;
  gender?: string;
  work_authorization?: string;
  work_mode?: string;
  phone?: string;
  linkedin_url?: string;
  target_roles?: string[];
  target_locations?: string[];
  languages?: string[];
  tools_software?: string[];
  summary: string;
  keywords: string[];
  excluded_terms?: string[];
}

export interface UserCVMetadata {
  id?: number;
  user_email: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

export interface DashboardApiStats {
  total: number;
  counts: Record<string, number>;
  employers: number;
}
