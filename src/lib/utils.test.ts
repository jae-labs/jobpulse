import { describe, it, expect } from 'vitest';
import { cn, toSafeHttpUrl } from './utils';

describe('utils cn', () => {
  it('merges class names correctly', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('resolves tailwind conflicts using tailwind-merge', () => {
    expect(cn('px-2 text-red-500', 'px-4 text-blue-500')).toBe('px-4 text-blue-500');
  });
});

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

