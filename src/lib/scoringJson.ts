import type { AiAnalysis, SubScores } from '../types/job';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scoring data');
  return value as Record<string, unknown>;
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid scoring number');
  return value;
}
function text(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new Error('Invalid scoring text');
  return value;
}
function strings(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Invalid scoring list');
  return value;
}
export function parseSubScores(value: unknown): SubScores | undefined {
  if (value == null) return undefined;
  const row = record(value);
  const result = {} as SubScores;
  for (const key of ['domain', 'semantic', 'competency', 'seniority', 'salary', 'contract', 'target_role', 'location', 'work_mode', 'fixed_term'] as const) result[key] = finite(row[key]);
  for (const key of ['onsite_penalty', 'auth_deduction', 'negative_domain', 'disqualified'] as const) if (row[key] != null) result[key] = finite(row[key]);
  return result;
}
export function parseAnalysis(value: unknown, score = 0, tier = ''): AiAnalysis | undefined {
  if (value == null) return undefined;
  const row = record(value);
  return {
    fit_score: row.fit_score == null ? score : finite(row.fit_score), fit_tier: text(row.fit_tier, tier),
    role_domain: text(row.role_domain, 'Uncategorized'), seniority_level: text(row.seniority_level),
    salary_fit: text(row.salary_fit), reasoning: text(row.reasoning),
    alignments: strings(row.alignments), mismatch_flags: strings(row.mismatch_flags), matched_skills: strings(row.matched_skills),
    semantic_similarity: row.semantic_similarity == null ? 0 : finite(row.semantic_similarity), sub_scores: parseSubScores(row.sub_scores),
  };
}
