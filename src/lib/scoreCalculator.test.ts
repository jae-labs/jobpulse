import { describe, it, expect } from 'vitest';
import { calculateFitScore, recalculateJob, recalculateJobs, DEFAULT_WEIGHTS } from './scoreCalculator';
import type { Job, SubScores } from '../types/job';

describe('scoreCalculator', () => {
  it('calculates score with default weights accurately for high match', () => {
    const subScores: SubScores = {
      domain: 1.0,
      semantic: 0.9,
      competency: 0.85,
      seniority: 1.0,
      salary: 1.0,
      contract: 1.0,
      target_role: 1,
      location: 1,
      work_mode: 1,
      fixed_term: 0,
    };

    const result = calculateFitScore(subScores, DEFAULT_WEIGHTS);
    expect(result.fit_score).toBeGreaterThanOrEqual(90);
    expect(result.fit_tier).toBe('Strong Match');
  });

  it('handles negative domain penalty capped at 15', () => {
    const subScores: SubScores = {
      domain: 0.2,
      semantic: 0.5,
      competency: 0.3,
      seniority: 0.4,
      salary: 0.5,
      contract: 0.5,
      target_role: 0,
      location: 0,
      work_mode: 0,
      fixed_term: 0,
      negative_domain: 1,
    };

    const result = calculateFitScore(subScores);
    expect(result.fit_score).toBeLessThanOrEqual(15);
    expect(['Low Match', 'Mismatch']).toContain(result.fit_tier);
  });

  it('caps disqualified candidate score at disqualification_cap', () => {
    const subScores: SubScores = {
      domain: 1.0,
      semantic: 1.0,
      competency: 1.0,
      seniority: 1.0,
      salary: 1.0,
      contract: 1.0,
      target_role: 0,
      location: 0,
      work_mode: 0,
      fixed_term: 0,
      disqualified: 1,
    };

    const result = calculateFitScore(subScores, { ...DEFAULT_WEIGHTS, disqualification_cap: 10 });
    expect(result.fit_score).toBe(10);
    expect(result.fit_tier).toBe('Mismatch');
  });

  it('recalculates a job model preserving fields and updating fit_tier and relevance', () => {
    const mockJob: Job = {
      id: 101,
      title: 'Senior Software Engineer',
      company: 'Tech Corp',
      location: 'Dublin',
      url: 'https://example.com/job/101',
      source: 'company',
      employment_type: 'Full-time',
      salary_text: '€90,000',
      status: 'new',
      last_seen_at: '2026-09-10T12:00:00Z',
      matched_skills: ['React', 'TypeScript'],
      relevance: 50,
      fit_tier: 'Moderate Match',
      sub_scores: {
        domain: 1.0,
        semantic: 1.0,
        competency: 1.0,
        seniority: 1.0,
        salary: 1.0,
        contract: 1.0,
        target_role: 1,
        location: 1,
        work_mode: 1,
        fixed_term: 0,
      },
    };

    const updated = recalculateJob(mockJob, DEFAULT_WEIGHTS);
    expect(updated.relevance).toBe(100);
    expect(updated.fit_tier).toBe('Strong Match');
    expect(updated.title).toBe('Senior Software Engineer');
  });

  it('recalculates and re-ranks an array of jobs against weights', () => {
    const jobA: Job = {
      id: 1,
      title: 'Job A',
      company: 'A Corp',
      location: 'Dublin',
      url: 'https://example.com/1',
      source: 'company',
      employment_type: 'Full-time',
      salary_text: null,
      status: 'new',
      last_seen_at: '2026-09-10T12:00:00Z',
      matched_skills: [],
      relevance: 10,
      sub_scores: {
        domain: 0.2,
        semantic: 0.2,
        competency: 0.2,
        seniority: 0.2,
        salary: 0.2,
        contract: 0.2,
        target_role: 0,
        location: 0,
        work_mode: 0,
        fixed_term: 0,
      },
    };

    const jobB: Job = {
      id: 2,
      title: 'Job B',
      company: 'B Corp',
      location: 'Remote',
      url: 'https://example.com/2',
      source: 'company',
      employment_type: 'Full-time',
      salary_text: null,
      status: 'new',
      last_seen_at: '2026-09-10T12:00:00Z',
      matched_skills: [],
      relevance: 10,
      sub_scores: {
        domain: 0.9,
        semantic: 0.9,
        competency: 0.9,
        seniority: 0.9,
        salary: 0.9,
        contract: 0.9,
        target_role: 1,
        location: 1,
        work_mode: 1,
        fixed_term: 0,
      },
    };

    const ranked = recalculateJobs([jobA, jobB], DEFAULT_WEIGHTS);
    expect(ranked[0].id).toBe(2);
    expect(ranked[1].id).toBe(1);
    expect(ranked[0].relevance).toBeGreaterThan(ranked[1].relevance);

    // Handles undefined weights gracefully
    expect(recalculateJobs([jobA, jobB], undefined)).toEqual([jobA, jobB]);
    expect(recalculateJobs([])).toEqual([]);
  });
});
