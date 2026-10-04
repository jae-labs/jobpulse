import { describe, it, expect } from 'vitest';
import { previewWeightedScore, topPreviewJobs } from './scoreCalculator';
import { DEFAULT_SCORING_WEIGHTS as DEFAULT_WEIGHTS } from './scoringRules';
import type { Job } from '../types/job';

describe('previewWeightedScore', () => {
  it('gives 90 points for 90 percent across default base factors and caps bonuses', () => {
    const sub_scores = {
      sector: 0.9, semantic: 0.9, competency: 0.9, seniority: 0.9,
      salary: 0.9, contract: 0.9, target_role: 0, location: 0,
      work_mode: 0, fixed_term: 0,
    };
    expect(previewWeightedScore({ sub_scores, relevance: 0 }, DEFAULT_WEIGHTS)).toBe(90);
    expect(previewWeightedScore({ sub_scores, relevance: 0 }, {
      ...DEFAULT_WEIGHTS, sector: 25, salary: 15,
    })).toBe(99);
    expect(previewWeightedScore({
      sub_scores: { ...sub_scores, target_role: 1, location: 1, work_mode: 1 }, relevance: 0,
    }, DEFAULT_WEIGHTS)).toBe(100);
  });

  it('matches the SQL scoring formula, including deductions and caps', () => {
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
        sector: 1,
        semantic: 0.6,
        competency: 0.5,
        seniority: 0.4,
        salary: 0,
        contract: 0,
        target_role: 0,
        location: 0,
        work_mode: 0,
        onsite_penalty: 1,
        fixed_term: 1,
        auth_deduction: 3,
      },
    };

    expect(previewWeightedScore(job, DEFAULT_WEIGHTS)).toBe(36);
    expect(previewWeightedScore(job, { ...DEFAULT_WEIGHTS, sector: 15 })).toBe(31);
    expect(previewWeightedScore({ ...job, sub_scores: { ...job.sub_scores!, disqualified: 1 } }, DEFAULT_WEIGHTS)).toBe(10);
    expect(previewWeightedScore({ ...job, sub_scores: { ...job.sub_scores!, negative_sector: 1 } }, DEFAULT_WEIGHTS)).toBe(15);
  });

  it('changes the top-five membership and order when weights move', () => {
    const subs = {
      sector: 0, semantic: 0, competency: 0, seniority: 0, salary: 0,
      contract: 0, target_role: 0, location: 0, work_mode: 0, fixed_term: 0,
    };
    const jobs = Array.from({ length: 6 }, (_, index): Job => ({
      id: index + 1,
      title: `Role ${index + 1}`,
      company: 'Example',
      location: 'Dublin',
      employment_type: 'Permanent',
      salary_text: null,
      url: `https://example.com/${index + 1}`,
      source: 'direct',
      status: 'new',
      last_seen_at: '2026-09-25T10:00:00Z',
      matched_skills: [],
      relevance: 90 - index,
      sub_scores: index === 5
        ? { ...subs, sector: 1 }
        : { ...subs, semantic: (0.9 - index * 0.1) },
    }));

    expect(topPreviewJobs(jobs, DEFAULT_WEIGHTS).map((job) => job.id)).toEqual([1, 6, 2, 3, 4]);
    expect(topPreviewJobs(jobs, { ...DEFAULT_WEIGHTS, sector: 5 }).map((job) => job.id)).toEqual([1, 2, 3, 4, 5]);
  });
});
