import { describe, expect, it } from 'vitest';
import { effectiveAvailability } from './jobAvailability';
import { availabilityScope } from './jobsRpcArgs';

const now = Date.parse('2026-10-09T12:00:00Z');
describe('posting availability', () => {
  it('never treats missing, stale or future confirmation as active or closed', () => {
    for (const checked of [undefined, 'invalid', '2026-10-08T12:00:00Z', '2026-10-10T12:00:00Z']) {
      expect(effectiveAvailability({ availability_status: 'active', availability_checked_at: checked }, now)).toBe('unverified');
    }
    expect(effectiveAvailability({}, now)).toBe('unverified');
    expect(effectiveAvailability({ availability_status: 'active', availability_checked_at: '2026-10-09T11:00:00Z' }, now)).toBe('active');
    expect(effectiveAvailability({ availability_status: 'closed' }, now)).toBe('closed');
  });
  it('keeps application and bookmark history while default browsing is active', () => {
    for (const status of ['saved', 'applied', 'interviewing', 'rejected', 'not_interested']) expect(availabilityScope({ status })).toBe('all');
    for (const status of ['all', 'new', undefined]) expect(availabilityScope({ status })).toBe('active');
    expect(availabilityScope({ status: 'saved', availability: 'closed' })).toBe('closed');
  });
});
