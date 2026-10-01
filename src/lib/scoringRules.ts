import defaults from '../../shared/scoringDefaults.json';
import type { ScoringRules, ScoringWeights } from '../types/job';

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = defaults.weights;
export const DEFAULT_SCORING_RULES: ScoringRules = defaults;

/** Missing rules use defaults; explicitly empty lists stay empty. */
export function resolveScoringRules(value?: ScoringRules): ScoringRules & {
  disqualifiers: string[];
  weights: ScoringWeights;
} {
  return {
    positive_domains: value?.positive_domains ?? defaults.positive_domains,
    negative_domains: value?.negative_domains ?? defaults.negative_domains,
    seniority_tiers: value?.seniority_tiers ?? defaults.seniority_tiers,
    disqualifiers: value?.disqualifiers ?? defaults.disqualifiers,
    weights: { ...DEFAULT_SCORING_WEIGHTS, ...value?.weights },
  };
}
