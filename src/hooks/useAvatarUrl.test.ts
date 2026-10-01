import { describe, expect, it } from 'vitest';
import { avatarStoragePath } from './useAvatarUrl';

describe('avatarStoragePath', () => {
  it('keeps storage paths', () => {
    expect(avatarStoragePath('11111111-1111-1111-1111-111111111111/avatar'))
      .toBe('11111111-1111-1111-1111-111111111111/avatar');
  });

  it('rejects URLs and inline image data', () => {
    expect(avatarStoragePath('https://example.com/image.png')).toBeNull();
    expect(avatarStoragePath('data:image/png;base64,AA==')).toBeNull();
  });
});
