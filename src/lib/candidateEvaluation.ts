import type { Database } from '../types/database.types';
import type { Job } from '../types/job';

type Evaluation = Partial<Pick<Database['public']['Tables']['user_job_evaluations']['Row'],
  'relevance' | 'fit_tier' | 'matched_skills' | 'ai_analysis'>>;

/** Candidate fields come only from the current user's evaluation. */
export function candidateEvaluationFields(evaluation?: Evaluation | null): Pick<Job,
  'relevance' | 'fit_tier' | 'matched_skills' | 'role_domain' | 'seniority_level' | 'ai_analysis' | 'sub_scores'> {
  const raw = evaluation?.ai_analysis;
  const analysis = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as unknown as Job['ai_analysis'] : undefined;
  return {
    relevance: evaluation?.relevance ?? 0,
    fit_tier: evaluation?.fit_tier ?? 'Unassessed',
    matched_skills: Array.isArray(evaluation?.matched_skills)
      ? evaluation.matched_skills.filter((skill): skill is string => typeof skill === 'string') : [],
    role_domain: analysis?.role_domain?.trim() || 'General Administration',
    seniority_level: analysis?.seniority_level,
    ai_analysis: analysis,
    sub_scores: analysis?.sub_scores,
  };
}
