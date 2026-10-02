import { describe, expect, it } from 'vitest';
import { addSupabaseCspOrigins } from '../../vite.config';

describe('map and storage image CSP', () => {
  it('preserves map tiles while allowing configured Supabase avatars and websocket requests', () => {
    const headers = "img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self';";
    const result = addSupabaseCspOrigins(headers, 'https://example.supabase.co');
    expect(result).toContain("img-src 'self' data: blob: https://tile.openstreetmap.org https://example.supabase.co;");
    expect(result).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co;");
  });
});
