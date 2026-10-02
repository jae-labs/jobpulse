export const STATUS_LIST = [
  'new',
  'applied',
  'interviewing',
  'interested',
  'not_interested',
] as const;

export type JobStatus = (typeof STATUS_LIST)[number];

/** Normalized scoring factors; auth_deduction is an absolute point deduction. */
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
  salary_min_amount?: number | null;
  salary_max_amount?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  description?: string;
  url: string;
  source: string;
  employer_id?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  relevance: number;
  matched_skills: string[];
  fit_tier?: string;
  role_domain?: string;
  seniority_level?: string;
  ai_analysis?: AiAnalysis;
  // Preview scores; full analysis loads with useJobDetailQuery.
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
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  careers_url: string;
  description?: string | null;
  website?: string | null;
  status?: string | null;
  opportunities_found?: number | null;
  last_scraped_at?: string | null;
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
}

export interface NegativeDomainRule {
  name: string;
  keywords: string[];
  reason: string;
}

export interface SeniorityTierRule {
  name: string;
  keywords: string[];
  score_weight: number;
  note: string;
}

export interface ScoringRules {
  positive_domains: ScoringDomainRule[];
  negative_domains: NegativeDomainRule[];
  seniority_tiers: SeniorityTierRule[];
  disqualifiers?: string[];
  weights?: ScoringWeights;
}

export interface Profile {
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location: string;
  salary_min: number;
  employment?: string;
  education?: string;
  certifications?: string;
  current_role?: string;
  experience_level?: string;
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
  scoring_rules?: ScoringRules;
  avatar_url?: string;
}

export interface UserDocumentMetadata {
  id?: number;
  user_id?: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  description?: string;
}

export interface OverviewCategory {
  name: string;
  value: number;
  avgMatch: number;
}

export interface OverviewMetrics {
  evaluated: number;
  locations: Array<{ loc: string; count: number }>;
  total: number;
  high_fit: number;
  counts: Record<string, number>;
  stage_averages: Record<string, number>;
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
