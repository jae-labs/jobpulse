import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addSupabaseCspOrigins } from '../../vite.config';

describe('map and storage image CSP', () => {
  it('allows the default tile origin in both actual document and hosting policies', () => {
    const document = readFileSync('index.html', 'utf8');
    const headers = readFileSync('public/_headers', 'utf8');
    const policy = document.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(policy).toBeDefined();
    for (const content of [policy!, headers]) {
      const built = addSupabaseCspOrigins(content, 'https://example.supabase.co');
      const origins = built.match(/img-src\s+([^;]+);/)?.[1].split(/\s+/);
      expect(origins).toContain('https://tiles.openfreemap.org');
      expect(origins).toContain('https://example.supabase.co');
      expect(origins).not.toContain('*');
      expect(built.match(/connect-src\s+([^;]+);/)?.[1].split(/\s+/)).toContain('https://tiles.openfreemap.org');
      expect(built).toContain("worker-src 'self' blob:");
    }
  });
  it('preserves map tiles while allowing configured Supabase avatars and websocket requests', () => {
    const headers = "img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self';";
    const result = addSupabaseCspOrigins(headers, 'https://example.supabase.co');
    expect(result).toContain("img-src 'self' data: blob: https://tiles.openfreemap.org https://example.supabase.co;");
    expect(result).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co;");
  });
});
