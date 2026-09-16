import { describe, it, expect } from 'vitest';
import { queryKeys } from './useQueries';

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
