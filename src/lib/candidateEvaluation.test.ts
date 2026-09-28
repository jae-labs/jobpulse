import { describe, expect, it } from 'vitest';
import { candidateEvaluationFields } from './candidateEvaluation';

describe('candidateEvaluationFields', () => {
  it('returns an unassessed job when the candidate has no evaluation', () => {
    expect(candidateEvaluationFields(null)).toEqual({
      relevance: 0, fit_tier: 'Unassessed', matched_skills: [],
      role_domain: 'General Administration', seniority_level: undefined,
      ai_analysis: undefined, sub_scores: undefined,
    });
  });

  it('uses the candidate analysis for classifications and filters malformed skills', () => {
    const fields = candidateEvaluationFields({
      relevance: 80, fit_tier: 'Strong Match', matched_skills: ['Python', 12],
      ai_analysis: { role_domain: 'Engineering', seniority_level: 'Senior' },
    });
    expect(fields.relevance).toBe(80);
    expect(fields.role_domain).toBe('Engineering');
    expect(fields.seniority_level).toBe('Senior');
    expect(fields.matched_skills).toEqual(['Python']);
  });
});
