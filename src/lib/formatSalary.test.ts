import { describe, it, expect } from 'vitest';
import { formatCompactSalary } from './formatSalary';

describe('formatCompactSalary', () => {
  it('formats range amounts into compact k format', () => {
    expect(
      formatCompactSalary({
        salary_min_amount: 110000,
        salary_max_amount: 135000,
        salary_currency: 'EUR',
      })
    ).toBe('€110k - €135k');
  });

  it('formats single amount into compact k format', () => {
    expect(
      formatCompactSalary({
        salary_min_amount: 100000,
        salary_max_amount: 100000,
        salary_currency: 'USD',
      })
    ).toBe('$100k');
  });

  it('formats decimal thousands into compact k format', () => {
    expect(
      formatCompactSalary({
        salary_min_amount: 95500,
        salary_max_amount: 115000,
        salary_currency: 'GBP',
      })
    ).toBe('£95.5k - £115k');
  });

  it('formats minimum-only amounts with a plus sign', () => {
    expect(
      formatCompactSalary({
        salary_min_amount: 80000,
        salary_max_amount: null,
        salary_currency: 'EUR',
      })
    ).toBe('€80k+');
  });

  it('falls back to regex normalization of salary_text if min/max not yet set', () => {
    expect(
      formatCompactSalary({
        salary_text: '€110,000 - €135,000',
      })
    ).toBe('€110k - €135k');
  });

  it('returns fallback string when salary information is null or missing', () => {
    expect(formatCompactSalary(null)).toBe('Competitive');
    expect(formatCompactSalary(undefined)).toBe('Competitive');
    expect(formatCompactSalary({ salary_text: null })).toBe('Competitive');
  });
});
