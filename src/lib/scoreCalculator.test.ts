import { describe, it, expect } from 'vitest';
import { previewWeightedScore } from './scoreCalculator';
import { DEFAULT_SCORING_WEIGHTS as DEFAULT_WEIGHTS } from './scoringRules';
import type { Job } from '../types/job';

describe('previewWeightedScore', () => {
  it('previews weight changes against stored normalized evaluation factors', () => {
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
        domain: 1.0,
        semantic: 0.96,
        competency: 1.0,
        seniority: 1.0,
        salary: 1.0,
        contract: 1.0,
        target_role: 1.0,
        location: 1.0,
        work_mode: 1.0,
        fixed_term: 0,
      },
    };

    expect(previewWeightedScore(job, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS)).toBe(96);
    expect(previewWeightedScore(job, { ...DEFAULT_WEIGHTS, domain: 15 }, DEFAULT_WEIGHTS)).toBe(86);
    expect(previewWeightedScore(job, { ...DEFAULT_WEIGHTS, semantic: 15 }, DEFAULT_WEIGHTS)).toBe(86);
  });

});
