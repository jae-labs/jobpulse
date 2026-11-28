import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

const first = 'a1111111-1111-4111-8111-111111111111';
const second = 'b2222222-2222-4222-8222-222222222222';
const cases = {
  jobTrackingMutations: (uid: string) => queryKeys.jobTrackingMutations(uid),
  scoringState: (uid: string) => queryKeys.scoringState(uid),
  overviewMetrics: (uid: string) => queryKeys.overviewMetrics(uid),
  jobMapPreview: (uid: string) => queryKeys.jobMapPreview(uid, [101, 102]),
  jobMap: (uid: string) => queryKeys.jobMap(uid, { sector: "same sector" }),
  jobsPage: (uid: string) => queryKeys.jobsPage(uid, { search: 'same query' }),
  jobsSearchPage: (uid: string) => queryKeys.jobsSearchPage(uid, { search: 'same query' }),
  scoringPreviewJobs: (uid: string) => queryKeys.scoringPreviewJobs(uid),
  jobById: (uid: string) => queryKeys.jobById(101, uid),
  profile: (uid: string) => queryKeys.profile(uid),
  userCvs: (uid: string) => queryKeys.userCvs(uid),
  userCoverLetters: (uid: string) => queryKeys.userCoverLetters(uid),
  invitations: (uid: string) => queryKeys.invitations(uid),
  avatarUrl: (uid: string) => queryKeys.avatarUrl(`${uid}/avatar`),
};
describe('tenant cache contract', () => {
  it.each([
    [queryKeys.overviewMetrics(first), ['overview-metrics', first]],
    [queryKeys.overviewMetrics(null), ['overview-metrics', null]],
    [queryKeys.jobsPage(first, { status: 'new', limit: 40 }), ['jobs-page', first, { status: 'new', limit: 40 }]],
    [queryKeys.jobById(123, first), ['job-by-id', 123, first]],
    [queryKeys.userCvs(first), ['user-cvs', first]],
    [queryKeys.userCoverLetters(first), ['user-cover-letters', first]],
    [queryKeys.invitations(first), ['invitations', first]],
    [queryKeys.invitations(null), ['invitations', null]],
    [queryKeys.jobsSearchPage(first, { search: 'designer' }), ['jobs-search-page', first, { search: 'designer' }]],
  ])('preserves the key layout %j', (key, expected) => {
    expect(key).toEqual(expected);
  });

  it('keeps finite search and infinite page caches distinct, including invalidation prefixes', () => {
    expect(queryKeys.jobsPage(first)).toEqual(['jobs-page', first]);
    expect(queryKeys.jobsSearchPage(first)).toEqual(['jobs-search-page', first]);
    expect(queryKeys.jobsPage(first, { search: 'same' }))
      .not.toEqual(queryKeys.jobsSearchPage(first, { search: 'same' }));
  });

  it('requires an explicit isolation test for every new key factory', () => {
    expect(Object.keys(queryKeys).sort()).toEqual(Object.keys(cases).sort());
  });
  for (const [name, key] of Object.entries(cases)) {
    it(`${name} cannot share a cache entry between identities`, () => {
      expect(key(first)).not.toEqual(key(second));
      expect(key(first)).toEqual(key(first));
    });
  }
});
