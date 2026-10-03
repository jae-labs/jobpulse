import defaults from '../../shared/scoringDefaults.json';
import type { ScoringRules, ScoringWeights } from '../types/job';

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = defaults.weights;
export const DEFAULT_SCORING_RULES: ScoringRules = defaults;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scoring rules');
  return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Invalid scoring rules');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid scoring rules');
  return value;
}
function weight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid scoring weight');
  return value;
}
function list<T>(value: unknown, fallback: T[], parse: (row: Record<string, unknown>) => T): T[] {
  if (value == null) return fallback;
  if (!Array.isArray(value)) throw new Error('Invalid scoring rules');
  return value.map(item => parse(object(item)));
}

/** Validate persisted JSON; missing rules use defaults and empty lists stay empty. */
export function resolveScoringRules(value?: unknown): ScoringRules & {
  disqualifiers: string[];
  weights: ScoringWeights;
} {
  const row = value == null ? {} : object(value);
  const weights = { ...DEFAULT_SCORING_WEIGHTS };
  if (row.weights != null) {
    const supplied = object(row.weights);
    for (const key of Object.keys(weights) as (keyof ScoringWeights)[]) {
      if (supplied[key] != null) weights[key] = weight(supplied[key]);
    }
  }
  return {
    positive_domains: list(row.positive_domains, defaults.positive_domains, rule => ({ name: text(rule.name), keywords: strings(rule.keywords), note: text(rule.note ?? '') })),
    negative_domains: list(row.negative_domains, defaults.negative_domains, rule => ({ name: text(rule.name), keywords: strings(rule.keywords), reason: text(rule.reason ?? '') })),
    seniority_tiers: list(row.seniority_tiers, defaults.seniority_tiers, rule => ({ name: text(rule.name), keywords: strings(rule.keywords), score_weight: weight(rule.score_weight), note: text(rule.note ?? '') })),
    disqualifiers: row.disqualifiers == null ? defaults.disqualifiers : strings(row.disqualifiers),
    weights,
  };
}
