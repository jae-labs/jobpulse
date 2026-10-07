import { describe, expect, it } from 'vitest';
import { corsHeadersFor, isOriginAllowed, resolveAllowedOrigins } from './cors';

describe('delete-account CORS', () => {
  it('allows local development origins by default', () => {
    expect(isOriginAllowed('http://localhost:5173', undefined)).toBe(true);
    expect(corsHeadersFor('http://localhost:5173', undefined)['Access-Control-Allow-Origin'])
      .toBe('http://localhost:5173');
  });

  it('rejects browser origins that are not configured and never wildcards', () => {
    expect(isOriginAllowed('https://attacker.example', undefined)).toBe(false);
    const headers = corsHeadersFor('https://attacker.example', undefined);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(Object.values(headers)).not.toContain('*');
  });

  it('allows explicitly configured origins', () => {
    const configured = 'https://app.example.com, https://admin.example.com';
    expect(isOriginAllowed('https://app.example.com', configured)).toBe(true);
    expect(isOriginAllowed('https://other.example.com', configured)).toBe(false);
    expect(resolveAllowedOrigins(configured).has('https://admin.example.com')).toBe(true);
  });

  it('allows non-browser requests without an Origin header', () => {
    expect(isOriginAllowed(null, undefined)).toBe(true);
  });
});
