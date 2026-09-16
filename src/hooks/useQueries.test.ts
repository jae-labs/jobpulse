import { describe, it, expect } from 'vitest';
import { queryKeys, validateOverviewMetrics, validateJobsPageResult } from './useQueries';

describe('useQueries queryKeys', () => {
  it('normalizes email in overviewMetrics query key', () => {
    expect(queryKeys.overviewMetrics(' User@Example.COM ')).toEqual([
      'overview-metrics',
      'user@example.com',
    ]);
    expect(queryKeys.overviewMetrics(null)).toEqual(['overview-metrics', null]);
  });

  it('normalizes email in jobsPage query key', () => {
    const params = { status: 'new', limit: 40 };
    expect(queryKeys.jobsPage('TEST@domain.com', params)).toEqual([
      'jobs-page',
      'test@domain.com',
      params,
    ]);
  });

  it('generates consistent keys for documents', () => {
    expect(queryKeys.userCvs('Alice@Work.com')).toEqual(['user-cvs', 'alice@work.com']);
    expect(queryKeys.userCoverLetters('Alice@Work.com')).toEqual([
      'user-cover-letters',
      'alice@work.com',
    ]);
  });

  it('keeps finite command search results separate from infinite job pages', () => {
    expect(queryKeys.jobsSearchPage('TEST@domain.com', { search: 'designer' })).toEqual([
      'jobs-search-page',
      'test@domain.com',
      { search: 'designer' },
    ]);
  });

  it('generates static keys for jobCount and sources', () => {
    expect(queryKeys.jobCount()).toEqual(['job-count']);
    expect(queryKeys.sources()).toEqual(['sources']);
  });
});

describe('RPC boundary validation', () => {
  it('validates and defaults overview metrics correctly', () => {
    const raw = {
      total: 42,
      high_fit: 10,
      counts: { new: 30, applied: 12 },
      categories: [{ name: 'Engineering', value: 25, avgMatch: 88 }],
    };
    const validated = validateOverviewMetrics(raw);
    expect(validated.total).toBe(42);
    expect(validated.high_fit).toBe(10);
    expect(validated.counts.new).toBe(30);
    expect(validated.categories[0].name).toBe('Engineering');
    expect(validated.relevance_distribution).toEqual([]);
  });

  it('throws error when overview metrics payload is not an object', () => {
    expect(() => validateOverviewMetrics(null)).toThrow('Invalid overview metrics response');
    expect(() => validateOverviewMetrics('invalid')).toThrow('Invalid overview metrics response');
  });

  it('validates and sanitizes jobs page items', () => {
    const raw = {
      total: 1,
      items: [
        {
          id: '123',
          title: 'Staff Architect',
          company: 'Tech Co',
          status: 'interviewing',
          relevance: '85',
          matched_skills: ['AWS', 'TypeScript'],
        },
      ],
    };
    const result = validateJobsPageResult(raw);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(123);
    expect(result.items[0].title).toBe('Staff Architect');
    expect(result.items[0].status).toBe('interviewing');
    expect(result.items[0].relevance).toBe(85);
    expect(result.items[0].matched_skills).toEqual(['AWS', 'TypeScript']);
  });

  it('defaults invalid status to new in jobs page result', () => {
    const raw = {
      total: 1,
      items: [{ id: 1, title: 'Job', status: 'unknown_status' }],
    };
    const result = validateJobsPageResult(raw);
    expect(result.items[0].status).toBe('new');
  });
});
