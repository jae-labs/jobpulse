import { describe, it, expect } from 'vitest';
import { checkUserAuthorization } from './authConfig';

describe('authConfig', () => {
  describe('checkUserAuthorization', () => {
    it('returns unauthorized when no email is passed', async () => {
      const result = await checkUserAuthorization(null);
      expect(result.isAuthorized).toBe(false);
      expect(result.error).toBe('No email provided');

      const emptyResult = await checkUserAuthorization('   ');
      expect(emptyResult.isAuthorized).toBe(false);
      expect(emptyResult.error).toBe('No email provided');
    });
  });
});
