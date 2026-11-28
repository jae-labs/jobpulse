import { describe, it, expect } from 'vitest';
import { toSafeHttpUrl } from './utils';

describe('toSafeHttpUrl', () => {
  it('returns valid http and https URLs', () => {
    expect(toSafeHttpUrl('https://example.com/jobs/1')).toBe('https://example.com/jobs/1');
    expect(toSafeHttpUrl('http://jobs.example.org')).toBe('http://jobs.example.org/');
  });

  it('blocks javascript: and other malicious schemes', () => {
    expect(toSafeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(toSafeHttpUrl('JAVASCRIPT:alert(document.domain)')).toBeNull();
    expect(toSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(toSafeHttpUrl('file:///etc/passwd')).toBeNull();
    expect(toSafeHttpUrl('blob:https://example.com/uuid')).toBeNull();
  });

  it('handles null, undefined, or empty inputs gracefully', () => {
    expect(toSafeHttpUrl(null)).toBeNull();
    expect(toSafeHttpUrl(undefined)).toBeNull();
    expect(toSafeHttpUrl('')).toBeNull();
    expect(toSafeHttpUrl('   ')).toBeNull();
  });
});
