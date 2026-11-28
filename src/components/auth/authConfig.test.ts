import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkUserAuthorization } from './authConfig';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('authConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkUserAuthorization', () => {
    it('returns unauthorized when no email is passed', async () => {
      const result = await checkUserAuthorization(null);
      expect(result.isAuthorized).toBe(false);
      expect(result.error).toBe('No email provided');

      const emptyResult = await checkUserAuthorization('   ');
      expect(emptyResult.isAuthorized).toBe(false);
      expect(emptyResult.error).toBe('No email provided');
    });

    it('returns authorized when user row exists with status accepted', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { role: 'admin', status: 'accepted' },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase!.from).mockReturnValue({ select: mockSelect } as any);

      const result = await checkUserAuthorization('admin@example.com');
      expect(result.isAuthorized).toBe(true);
      expect(result.role).toBe('admin');
      expect(mockSelect).toHaveBeenCalledWith('role, status');
      expect(mockEq).toHaveBeenCalledWith('email', 'admin@example.com');
    });

    it('returns unauthorized when status is pending or revoked', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { role: 'member', status: 'pending' },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase!.from).mockReturnValue({ select: mockSelect } as any);

      const result = await checkUserAuthorization('pending@example.com');
      expect(result.isAuthorized).toBe(false);
    });

    it('returns error when database query fails', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase!.from).mockReturnValue({ select: mockSelect } as any);

      const result = await checkUserAuthorization('admin@example.com');
      expect(result.isAuthorized).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });
  });
});
