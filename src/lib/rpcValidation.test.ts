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
  it('accepts unknown coordinates and prefers shared sector aggregates', () => {
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
    expect(validated.companies).toBeUndefined();
    expect(validateOverviewMetrics({ ...raw, companies: 2599 }).companies).toBe(2599);
    expect(validateOverviewMetrics({ ...raw, companies: 0 }).companies).toBe(0);
    for (const companies of [-1, 1.5, '2599', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateOverviewMetrics({ ...raw, companies })).toThrow('Invalid overview company count');
    }
  });

  it('rejects an overview response missing chart data', () => {
    expect(() => validateOverviewMetrics({ total: 12, applied: 4, by_sector: {} }))
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
