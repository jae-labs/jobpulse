import { describe, it, expect } from 'vitest';
import { formatJobDescription } from './formatDescription';

describe('formatJobDescription', () => {
  it('handles empty, null, or undefined input', () => {
    expect(formatJobDescription('')).toBe('');
    expect(formatJobDescription(null)).toBe('');
    expect(formatJobDescription(undefined)).toBe('');
  });

  it('cleans HTML tags and entities', () => {
    const raw = '<p>Role:</p><br/>• Senior Engineer &amp; Architect &nbsp; in Dublin';
    const formatted = formatJobDescription(raw);
    expect(formatted).toContain('& Architect');
    expect(formatted).not.toContain('&amp;');
    expect(formatted).not.toContain('&nbsp;');
    expect(formatted).not.toContain('<p>');
    expect(formatted).not.toContain('<br/>');
  });

  it('normalizes bullet points and collapses excessive newlines', () => {
    const raw = 'Key Requirements:\n\n\n- Experience with React\n* TypeScript knowledge\n• • PostgreSQL expertise\n\n\n\nDone.';
    const formatted = formatJobDescription(raw);
    expect(formatted).toContain('• Experience with React');
    expect(formatted).toContain('• TypeScript knowledge');
    expect(formatted).toContain('• PostgreSQL expertise');
    expect(formatted).not.toContain('• •');
    expect(formatted).not.toContain('\n\n\n');
  });
});
