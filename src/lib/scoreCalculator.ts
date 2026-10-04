import type { Job, ScoringWeights } from '../types/job';

/** Mirrors score_from_subscores in the native SQL scoring migration. */
export function previewWeightedScore(
  job: Pick<Job, 'sub_scores' | 'ai_analysis' | 'relevance'>,
  weights: ScoringWeights,
): number {
  const subScores = job.sub_scores ?? job.ai_analysis?.sub_scores;
  if (!subScores) return job.relevance;

  const score = subScores.negative_sector
    ? Math.min(15, subScores.semantic * 20 + subScores.sector * 10)
    : subScores.sector * weights.sector
      + subScores.semantic * weights.semantic
      + subScores.competency * weights.competency
      + subScores.seniority * weights.seniority
      + subScores.salary * weights.salary
      + subScores.contract * weights.contract
      + subScores.target_role * weights.target_role_bonus
      + subScores.location * weights.location_bonus
      + subScores.work_mode * weights.work_mode_bonus
      - (subScores.onsite_penalty ?? 0) * 4
      - subScores.fixed_term * (weights.fixed_term_penalty ?? 8)
      - (subScores.auth_deduction ?? 0);
  const cap = subScores.disqualified
    ? Math.min(15, Math.max(0, weights.disqualification_cap))
    : 100;
  return Math.min(cap, Math.max(0, Math.min(100, Math.round(score))));
}

/** Find the current top matches across the full preview candidate pool. */
export function topPreviewJobs(jobs: Job[], weights: ScoringWeights, count = 5): Job[] {
  const top: Job[] = [];
  for (const job of jobs) {
    const scored = { ...job, relevance: previewWeightedScore(job, weights) };
    const insertion = top.findIndex((current) =>
      scored.relevance > current.relevance
      || (scored.relevance === current.relevance && scored.id > current.id));
    if (insertion >= 0) top.splice(insertion, 0, scored);
    else if (top.length < count) top.push(scored);
    if (top.length > count) top.pop();
  }
  return top;
}
