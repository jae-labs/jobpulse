import type { Job, ScoringWeights } from '../types/job';

/** Estimates how changing weights affects a stored evaluation's score. */
export function previewWeightedScore(
  job: Job,
  weights: ScoringWeights,
  baselineWeights: ScoringWeights
): number {
  const subScores = job.sub_scores ?? job.ai_analysis?.sub_scores;
  if (!subScores) return job.relevance;

  const coreKeys = ['domain', 'semantic', 'competency', 'seniority', 'salary', 'contract'] as const;
  let delta = coreKeys.reduce(
    (sum, key) => sum + subScores[key] * (weights[key] - baselineWeights[key]),
    0
  );

  const bonuses = [
    ['target_role', 'target_role_bonus'],
    ['location', 'location_bonus'],
    ['work_mode', 'work_mode_bonus'],
  ] as const;
  for (const [scoreKey, weightKey] of bonuses) {
    delta += subScores[scoreKey]
      * (weights[weightKey] - baselineWeights[weightKey]);
  }

  const baselinePenalty = baselineWeights.fixed_term_penalty ?? 0;
  const currentPenalty = weights.fixed_term_penalty ?? 0;
  delta -= subScores.fixed_term
    * (currentPenalty - baselinePenalty);

  // The negative-domain path is capped separately from the normal weighted score.
  if (subScores.negative_domain) delta = 0;

  let score = job.relevance + delta;
  if (subScores.disqualified) {
    const baselineCap = baselineWeights.disqualification_cap;
    if (job.relevance >= baselineCap) score += weights.disqualification_cap - baselineCap;
    score = Math.min(score, weights.disqualification_cap);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
