import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_WEIGHTS, resolveScoringRules } from './scoringRules';

describe('resolveScoringRules', () => {
  it('keeps explicitly cleared lists and zero weights', () => {
    const rules = resolveScoringRules({
      positive_domains: [], negative_domains: [], seniority_tiers: [], disqualifiers: [],
      weights: { ...DEFAULT_SCORING_WEIGHTS, semantic: 0 },
    });
    expect(rules.disqualifiers).toEqual([]);
    expect(rules.weights.semantic).toBe(0);
  });

  it('uses the shared defaults without adding hidden dealbreakers', () => {
    const rules = resolveScoringRules();
    expect(rules.disqualifiers).toEqual([]);
    expect(rules.weights).toEqual(DEFAULT_SCORING_WEIGHTS);
  });
});
