import { describe, it, expect } from 'vitest';
import { previewWeightedScore } from './scoreCalculator';
import type { Job, ScoringWeights } from '../types/job';

const DEFAULT_WEIGHTS: ScoringWeights = {
  domain: 25, semantic: 25, competency: 20, seniority: 15, salary: 15, contract: 10,
  target_role_bonus: 6, location_bonus: 4, work_mode_bonus: 2,
  fixed_term_penalty: 8, disqualification_cap: 10,
};

describe('previewWeightedScore', () => {
  it('previews weight changes against stored point-based evaluation scores', () => {
    const job: Job = {
      id: 101,
      title: 'Staff Cloud Platform Engineer',
      company: 'Stripe',
      location: 'Dublin',
      employment_type: 'Permanent',
      salary_text: null,
      url: 'https://example.com/job',
      source: 'direct',
      status: 'new',
      last_seen_at: '2026-09-25T10:00:00Z',
      matched_skills: [],
      relevance: 96,
      sub_scores: {
        domain: 25,
        semantic: 24,
        competency: 20,
        seniority: 15,
        salary: 15,
        contract: 10,
        target_role: 6,
        location: 4,
        work_mode: 2,
        fixed_term: 0,
      },
    };

    expect(previewWeightedScore(job, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS)).toBe(96);
    expect(previewWeightedScore(job, { ...DEFAULT_WEIGHTS, domain: 15 }, DEFAULT_WEIGHTS)).toBe(86);
    expect(previewWeightedScore(job, { ...DEFAULT_WEIGHTS, semantic: 15 }, DEFAULT_WEIGHTS)).toBe(86);
  });

});
