import { describe, expect, it } from 'vitest';
import { avatarStoragePath } from './useAvatarUrl';

describe('avatarStoragePath', () => {
  it('keeps new UID paths and extracts legacy public avatar paths', () => {
    expect(avatarStoragePath('11111111-1111-1111-1111-111111111111/avatar'))
      .toBe('11111111-1111-1111-1111-111111111111/avatar');
    expect(avatarStoragePath('https://example.supabase.co/storage/v1/object/public/avatars/member%40example.com/avatar.png'))
      .toBe('member@example.com/avatar.png');
  });

  it('does not render an unrelated external image URL', () => {
    expect(avatarStoragePath('https://example.com/image.png')).toBeNull();
  });
});
