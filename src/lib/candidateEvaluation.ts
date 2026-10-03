import type { Database } from '../types/database.types';
import { previewWeightedScore } from './scoreCalculator';
import { resolveScoringRules } from './scoringRules';
import type { ScoringRules } from '../types/job';
import type { Job } from '../types/job';
import { parseAnalysis } from './scoringJson';

type Evaluation = Partial<Pick<Database['public']['Tables']['user_job_evaluations']['Row'],
  'relevance' | 'fit_tier' | 'matched_skills' | 'ai_analysis'>>;

/** Candidate fields come only from the current user's evaluation. */
export function candidateEvaluationFields(evaluation?: Evaluation | null, rules?: ScoringRules): Pick<Job,
  'relevance' | 'fit_tier' | 'matched_skills' | 'role_domain' | 'seniority_level' | 'ai_analysis' | 'sub_scores'> {
  const analysis = parseAnalysis(evaluation?.ai_analysis, evaluation?.relevance ?? 0, evaluation?.fit_tier ?? '');
  const relevance = rules ? previewWeightedScore({ relevance: evaluation?.relevance ?? 0, ai_analysis: analysis }, resolveScoringRules(rules).weights) : evaluation?.relevance ?? 0;
  const fitTier = !evaluation ? 'Unassessed' : relevance >= 75 ? 'Strong Match' : relevance >= 55 ? 'Good Match' : relevance >= 35 ? 'Moderate Match' : relevance >= 15 ? 'Low Match' : 'Mismatch';
  return {
    relevance,
    fit_tier: rules ? fitTier : evaluation?.fit_tier ?? 'Unassessed',
    matched_skills: Array.isArray(evaluation?.matched_skills)
      ? evaluation.matched_skills.filter((skill): skill is string => typeof skill === 'string') : [],
    role_domain: analysis?.role_domain?.trim() || 'Uncategorized',
    seniority_level: analysis?.seniority_level,
    ai_analysis: analysis && rules ? { ...analysis, fit_score: relevance, fit_tier: fitTier } : analysis,
    sub_scores: analysis?.sub_scores,
  };
}
