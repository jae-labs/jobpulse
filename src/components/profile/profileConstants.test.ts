import { describe, it, expect } from 'vitest';
import { parsePhone, COUNTRY_CODES, WORK_MODE_OPTIONS } from './profileConstants';

describe('profileConstants', () => {
  it('exports valid country codes and work modes', () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(5);
    expect(WORK_MODE_OPTIONS).toContain('Hybrid');
    expect(WORK_MODE_OPTIONS).toContain('Remote');
    expect(WORK_MODE_OPTIONS).toContain('On-site');
  });

  describe('parsePhone', () => {
    it('returns empty dial when input is empty or undefined', () => {
      expect(parsePhone('')).toEqual({ dial: '', number: '' });
      expect(parsePhone(undefined)).toEqual({ dial: '', number: '' });
    });

    it('parses Irish phone numbers correctly', () => {
      const parsed = parsePhone('+353 87 123 4567');
      expect(parsed.dial).toBe('+353');
      expect(parsed.number).toBe('87 123 4567');
    });

    it('parses UK and US phone numbers correctly', () => {
      const uk = parsePhone('+44 20 7946 0958');
      expect(uk.dial).toBe('+44');
      expect(uk.number).toBe('20 7946 0958');

      const us = parsePhone('+1 415 555 2671');
      expect(us.dial).toBe('+1');
      expect(us.number).toBe('415 555 2671');
    });

    it('falls back gracefully on unknown prefix', () => {
      const other = parsePhone('0871234567');
      expect(other.dial).toBe('');
      expect(other.number).toBe('0871234567');
    });
  });
});
