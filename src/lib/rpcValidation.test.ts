import { describe, expect, it } from 'vitest';
import { validateJobMapResult, validateJobsPageResult, validateOverviewMetrics } from './rpcValidation';

const job = {
  id: 1, title: 'Example Engineer', company: 'Example', location: 'Cork', url: 'https://example.invalid',
  source: 'test', last_seen_at: '2026-10-02', status: 'new', relevance: 0, matched_skills: [],
  employer_id: 12, employer_sector: 'Synthetic Sector', latitude: 0, longitude: 0,
};

describe('employer RPC boundary', () => {
  it.each(['new', 'applied', 'interviewing', 'rejected', 'not_interested'])('preserves pipeline status %s', status => {
    expect(validateJobsPageResult({ total: 1, items: [{ ...job, status }] }).items[0].status).toBe(status);
  });
  it('normalizes legacy bookmarks and rejects unknown pipeline states', () => {
    expect(validateJobsPageResult({ total: 1, items: [{ ...job, status: 'interested' }] }).items[0]).toMatchObject({ status: 'new', is_saved: true });
    expect(() => validateJobsPageResult({ total: 1, items: [{ ...job, status: 'invented' }] })).toThrow('Invalid job status');
  });
  it('preserves employer identity, shared sector and zero coordinates', () => {
    expect(validateJobsPageResult({ total: 1, items: [job] }).items[0]).toMatchObject({
      employer_id: 12, sector: 'Synthetic Sector', latitude: 0, longitude: 0,
    });
  });
  it.each([
    { latitude: 91 }, { longitude: -181 }, { latitude: Infinity },
    { latitude: null }, { employer_id: '12' }, { employer_id: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects malformed employer fields: %j', (invalid) => {
    expect(() => validateJobsPageResult({ total: 1, items: [{ ...job, ...invalid }] })).toThrow();
  });
  it('accepts unknown coordinates and separate sector/sector aggregates', () => {
    expect(validateJobsPageResult({ total: 1, items: [{ ...job, latitude: null, longitude: null }] }).items[0].latitude).toBeNull();
    const metrics = { total: 1, evaluated: 0, high_fit: 0, counts: { new: 1 }, locations: [],
      categories: [{ name: 'Uncategorized', value: 1, avgMatch: 0 }],
      sectors: [{ name: 'Synthetic Sector', value: 1, avgMatch: 0 }], relevance_distribution: [], top_skills: [],
    };
    expect(validateOverviewMetrics(metrics)).toMatchObject({ categories: metrics.sectors });
    expect(() => validateOverviewMetrics({ ...metrics, sectors: {} })).toThrow();
  });
});

describe('office map boundary', () => {
  const pin = { latitude: 0, longitude: 0, count: 1, job_ids: [1], title: 'Synthetic',
    company: 'Example', sector: 'Uncategorized', precision: 'company_office' };
  const result = { total: 1, mapped: 1, in_view: 1, truncated: false, pins: [], office_pins: [pin], office_truncated: false };
  it('validates office coordinates and accepts rolling deployments without the new layer', () => {
    expect(validateJobMapResult(result).office_pins).toEqual([pin]);
    expect(validateJobMapResult({ ...result, office_pins: undefined }).office_pins).toBeUndefined();
    expect(() => validateJobMapResult({ ...result, office_pins: [{ ...pin, latitude: 91 }] })).toThrow();
    expect(() => validateJobMapResult({ ...result, office_truncated: 'false' })).toThrow();
  });
});
