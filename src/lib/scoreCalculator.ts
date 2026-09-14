import type { Job, ScoringWeights, SubScores } from '../types/job';

export const DEFAULT_WEIGHTS: ScoringWeights = {
  domain: 25,
  semantic: 25,
  competency: 20,
  seniority: 15,
  salary: 15,
  contract: 10,
  target_role_bonus: 6,
  location_bonus: 4,
  work_mode_bonus: 2,
  fixed_term_penalty: 8,
  disqualification_cap: 10,
};

/**
 * Calculates match percentage score and fit tier from precomputed sub-scores and custom user weights.
 */
export function calculateFitScore(
  sub_scores: SubScores,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): { fit_score: number; fit_tier: string } {
  const domainMax = weights.domain ?? DEFAULT_WEIGHTS.domain;
  const semanticMax = weights.semantic ?? DEFAULT_WEIGHTS.semantic;
  const competencyMax = weights.competency ?? DEFAULT_WEIGHTS.competency;
  const seniorityMax = weights.seniority ?? DEFAULT_WEIGHTS.seniority;
  const salaryMax = weights.salary ?? DEFAULT_WEIGHTS.salary;
  const contractMax = weights.contract ?? DEFAULT_WEIGHTS.contract;
  const targetRoleBonus = weights.target_role_bonus ?? DEFAULT_WEIGHTS.target_role_bonus;
  const locationBonus = weights.location_bonus ?? DEFAULT_WEIGHTS.location_bonus;
  const workModeBonus = weights.work_mode_bonus ?? DEFAULT_WEIGHTS.work_mode_bonus;
  const fixedTermPenalty = weights.fixed_term_penalty ?? (DEFAULT_WEIGHTS.fixed_term_penalty || 8);
  const disqualificationCap = weights.disqualification_cap ?? DEFAULT_WEIGHTS.disqualification_cap;

  let fit_score = 0;

  if (sub_scores.negative_domain) {
    fit_score = Math.max(
      0,
      Math.min(15, Math.round((sub_scores.semantic * 20) + (sub_scores.domain * 10)))
    );
  } else {
    let raw =
      (sub_scores.domain * domainMax) +
      (sub_scores.semantic * semanticMax) +
      (sub_scores.competency * competencyMax) +
      (sub_scores.seniority * seniorityMax) +
      (sub_scores.salary * salaryMax) +
      (sub_scores.contract * contractMax);

    if (sub_scores.target_role) raw += targetRoleBonus;
    if (sub_scores.location) raw += locationBonus;
    if (sub_scores.work_mode) raw += workModeBonus;
    if (sub_scores.onsite_penalty) raw -= 4.0;
    if (sub_scores.fixed_term) raw -= fixedTermPenalty;
    if (sub_scores.auth_deduction) raw -= sub_scores.auth_deduction;

    fit_score = Math.max(0, Math.min(100, Math.round(raw)));
  }

  if (sub_scores.disqualified) {
    fit_score = Math.min(fit_score, disqualificationCap);
  }

  let fit_tier = 'Mismatch';
  if (fit_score >= 75) fit_tier = 'Strong Match';
  else if (fit_score >= 55) fit_tier = 'Good Match';
  else if (fit_score >= 35) fit_tier = 'Moderate Match';
  else if (fit_score >= 15) fit_tier = 'Low Match';

  return { fit_score, fit_tier };
}

/**
 * Re-scores a single Job instance if sub_scores are available in its ai_analysis.
 */
export function recalculateJob(job: Job, weights?: ScoringWeights): Job {
  const subScores = job.sub_scores ?? job.ai_analysis?.sub_scores;
  if (!subScores) return job;

  const { fit_score, fit_tier } = calculateFitScore(subScores, weights);
  return {
    ...job,
    relevance: fit_score,
    fit_tier,
    ai_analysis: job.ai_analysis
      ? {
          ...job.ai_analysis,
          fit_score,
          fit_tier,
        }
      : undefined,
  };
}

/**
 * Dynamically re-scores and re-ranks an array of jobs against the provided weights.
 */
export function recalculateJobs(jobs: Job[], weights?: ScoringWeights): Job[] {
  if (!weights || jobs.length === 0) return jobs;

  const updated = jobs.map((job) => recalculateJob(job, weights));
  return updated.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
}
