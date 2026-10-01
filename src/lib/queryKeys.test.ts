import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

const first = 'a1111111-1111-4111-8111-111111111111';
const second = 'b2222222-2222-4222-8222-222222222222';
const cases = {
  scoringState: (uid: string) => queryKeys.scoringState(uid),
  overviewMetrics: (uid: string) => queryKeys.overviewMetrics(uid),
  jobsPage: (uid: string) => queryKeys.jobsPage(uid, { search: 'same query' }),
  jobsSearchPage: (uid: string) => queryKeys.jobsSearchPage(uid, { search: 'same query' }),
  scoringPreviewJobs: (uid: string) => queryKeys.scoringPreviewJobs(uid),
  jobById: (uid: string) => queryKeys.jobById(101, uid),
  jobDetail: (uid: string) => queryKeys.jobDetail(101, uid),
  profile: (uid: string) => queryKeys.profile(uid),
  userCvs: (uid: string) => queryKeys.userCvs(uid),
  userCoverLetters: (uid: string) => queryKeys.userCoverLetters(uid),
  invitations: (uid: string) => queryKeys.invitations(uid),
  avatarUrl: (uid: string) => queryKeys.avatarUrl(`${uid}/avatar`),
};
describe('tenant cache contract', () => {
  it('requires an explicit isolation test for every new key factory', () => {
    expect(Object.keys(queryKeys).sort()).toEqual([...Object.keys(cases), 'sources'].sort());
  });
  for (const [name, key] of Object.entries(cases)) {
    it(`${name} cannot share a cache entry between identities`, () => {
      expect(key(first)).not.toEqual(key(second));
      expect(key(first)).toEqual(key(first));
    });
  }
});
