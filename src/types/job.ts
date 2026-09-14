export const STATUS_LIST = [
  'new',
  'applied',
  'interviewing',
  'interested',
  'not_interested',
] as const;

export type JobStatus = (typeof STATUS_LIST)[number];

export interface SubScores {
  domain: number;
  semantic: number;
  competency: number;
  seniority: number;
  salary: number;
  contract: number;
  target_role: number;
  location: number;
  work_mode: number;
  onsite_penalty?: number;
  fixed_term: number;
  auth_deduction?: number;
  negative_domain?: number;
  disqualified?: number;
}

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
  sub_scores?: SubScores;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  salary_text: string | null;
  description?: string;
  url: string;
  source: string;
  relevance: number;
  matched_skills: string[];
  fit_tier?: string;
  role_domain?: string;
  seniority_level?: string;
  ai_analysis?: AiAnalysis;
  // Small slice of ai_analysis.sub_scores fetched in bulk for instant client-side
  // re-ranking (see scoreCalculator.recalculateJob). The full ai_analysis
  // (narrative reasoning/alignments) is only loaded on demand via useJobDetailQuery.
  sub_scores?: SubScores;
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
  opportunities_found?: number | null;
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
  opportunities_found?: number | null;
}

export interface ScoringWeights {
  domain: number;
  semantic: number;
  competency: number;
  seniority: number;
  salary: number;
  contract: number;
  target_role_bonus: number;
  location_bonus: number;
  work_mode_bonus: number;
  fixed_term_penalty?: number;
  disqualification_cap: number;
}

export interface ScoringDomainRule {
  name: string;
  keywords: string[];
  note: string;
  patterns?: string[];
}

export interface NegativeDomainRule {
  name: string;
  keywords: string[];
  reason: string;
  patterns?: string[];
}

export interface SeniorityTierRule {
  name: string;
  keywords: string[];
  score_weight: number;
  note: string;
  patterns?: string[];
}

export interface ScoringRules {
  positive_domains: ScoringDomainRule[];
  negative_domains: NegativeDomainRule[];
  seniority_tiers: SeniorityTierRule[];
  disqualifiers?: string[];
  weights?: ScoringWeights;
  irish_language_patterns?: string[];
}

export interface Profile {
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location: string;
  minimum_salary: number;
  salary_min?: number;
  employment?: string;
  education?: string;
  certifications?: string;
  current_role?: string;
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
  scoring_rules?: ScoringRules;
  avatar_url?: string;
}


export interface UserCVMetadata {
  id?: number;
  user_email: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  description?: string;
}

export interface UserCoverLetterMetadata {
  id?: number;
  user_email: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  description?: string;
}

export interface UserJobEvaluation {
  id?: number;
  user_email: string;
  job_id: number;
  relevance: number;
  fit_tier: string;
  matched_skills: string[];
  ai_analysis?: AiAnalysis;
  calculated_at?: string;
}


export interface DashboardApiStats {
  total: number;
  counts: Record<string, number>;
  employers: number;
}

export interface OverviewCategory {
  name: string;
  value: number;
  avgMatch: number;
}

export interface OverviewMetrics {
  total: number;
  high_fit: number;
  counts: Record<string, number>;
  categories: OverviewCategory[];
  relevance_distribution: Array<{ range: string; min: number; max: number; count: number }>;
  top_skills: Array<{ skill: string; count: number; percentage: number }>;
}

export interface JobsPageParams {
  status?: string;
  domain?: string;
  minMatch?: number;
  location?: string;
  salary?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export interface JobsPageResult {
  total: number;
  items: Job[];
}
