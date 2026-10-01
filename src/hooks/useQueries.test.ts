import { describe, it, expect } from 'vitest';
import { queryKeys, validateOverviewMetrics, validateJobsPageResult } from './useQueries';

describe('useQueries queryKeys', () => {
  it('uses user ID in overviewMetrics query key', () => {
    expect(queryKeys.overviewMetrics('user-uuid')).toEqual([
      'overview-metrics',
      'user-uuid',
    ]);
    expect(queryKeys.overviewMetrics(null)).toEqual(['overview-metrics', null]);
  });

  it('uses user ID in jobsPage query key', () => {
    const params = { status: 'new', limit: 40 };
    expect(queryKeys.jobsPage('test-uuid', params)).toEqual([
      'jobs-page',
      'test-uuid',
      params,
    ]);
  });

  it('uses user ID in jobById query key', () => {
    expect(queryKeys.jobById(123, 'test-uuid')).toEqual([
      'job-by-id',
      123,
      'test-uuid',
    ]);
  });

  it('generates consistent keys for documents', () => {
    expect(queryKeys.userCvs('alice-uuid')).toEqual(['user-cvs', 'alice-uuid']);
    expect(queryKeys.userCoverLetters('alice-uuid')).toEqual([
      'user-cover-letters',
      'alice-uuid',
    ]);
  });

  it('keeps finite command search results separate from infinite job pages', () => {
    expect(queryKeys.jobsSearchPage('test-uuid', { search: 'designer' })).toEqual([
      'jobs-search-page',
      'test-uuid',
      { search: 'designer' },
    ]);
  });

  it('generates a static sources key', () => {
    expect(queryKeys.sources()).toEqual(['sources']);
  });

  it('uses user ID in invitations query key', () => {
    expect(queryKeys.invitations('alice-uuid')).toEqual(['invitations', 'alice-uuid']);
    expect(queryKeys.invitations(null)).toEqual(['invitations', null]);
  });
});

describe('RPC boundary validation', () => {
  it('validates the overview chart metrics contract', () => {
    const raw = {
      total: 42, evaluated: 12, locations: [],
      high_fit: 10,
      counts: { new: 30, applied: 12 },
      stage_averages: { new: 78, applied: 91 },
      categories: [{ name: 'Engineering', value: 25, avgMatch: 88 }],
      relevance_distribution: [{ range: '80-89%', min: 80, max: 89, count: 12 }],
      top_skills: [],
    };
    const validated = validateOverviewMetrics(raw);
    expect(validated.total).toBe(42);
    expect(validated.high_fit).toBe(10);
    expect(validated.counts.new).toBe(30);
    expect(validated.stage_averages.applied).toBe(91);
    expect(validated.categories[0].name).toBe('Engineering');
    expect(validated.relevance_distribution[0].count).toBe(12);
  });

  it('rejects an overview response missing chart data', () => {
    expect(() => validateOverviewMetrics({ total: 12, applied: 4, by_domain: {} }))
      .toThrow('Invalid overview metrics response: missing chart data');
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
          id: 123,
          title: 'Staff Architect', location: '', url: 'https://example.test', source: 'test', last_seen_at: '2026-10-01T00:00:00Z',
          company: 'Tech Co',
          status: 'interviewing',
          relevance: 85,
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

  it('rejects malformed item shape, nonfinite numbers and missing arrays', () => {
    for (const items of [[null], [{ id: '1', title: 'Job' }], [{ id: 1, matched_skills: ['valid',42] }]]) {
      expect(() => validateJobsPageResult({ total: 1, items })).toThrow();
    }
    expect(() => validateJobsPageResult({ total: NaN, items: [] })).toThrow();
    expect(() => validateOverviewMetrics({ total: 1, evaluated: 1, high_fit: 0, counts: { new: 1 }, locations: [], categories: [null], relevance_distribution: [], top_skills: [] })).toThrow();
  });

});


it('uses factory prefixes for both paginated caches', () => {
  expect(queryKeys.jobsPage('user-uuid')).toEqual(['jobs-page', 'user-uuid']);
  expect(queryKeys.jobsSearchPage('user-uuid')).toEqual(['jobs-search-page', 'user-uuid']);
});
