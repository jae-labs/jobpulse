import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuthSession } from './useAuthSession';
import type { Session } from '@supabase/supabase-js';

const mockClearAppCache = vi.fn();
vi.mock('../lib/queryClient', () => ({
  clearAppCache: () => mockClearAppCache(),
}));

const mockCheckUserAuthorization = vi.fn();
vi.mock('../components/auth/authConfig', () => ({
  checkUserAuthorization: (...args: unknown[]) => mockCheckUserAuthorization(...args),
}));

const mockSetSentryUser = vi.fn();
vi.mock('../lib/sentry', () => ({
  setSentryUser: (userId: string | null) => mockSetSentryUser(userId),
}));

let authStateChangeCallback: ((event: string, session: Session | null) => void) | null = null;
let mockGetSession: () => Promise<{ data: { session: Session | null } }>;

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        authStateChangeCallback = cb;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      },
    },
  },
}));

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateChangeCallback = null;
    mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
    mockCheckUserAuthorization.mockResolvedValue({ isAuthorized: true });
  });

  it('initializes with unauthenticated state when no session exists', async () => {
    mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.isAuthChecking).toBe(false);
    });

    expect(result.current.session).toBeNull();
    expect(result.current.isAuthorized).toBe(false);
  });

  it('authorizes a verified user and clears cache on user transition', async () => {
    const userSession = {
      user: { id: 'user-1', email: 'alice@example.com' },
    } as unknown as Session;

    mockGetSession = vi.fn().mockResolvedValue({ data: { session: userSession } });
    mockCheckUserAuthorization.mockResolvedValue({ isAuthorized: true });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.isAuthChecking).toBe(false);
    });

    expect(result.current.session).toEqual(userSession);
    expect(result.current.isAuthorized).toBe(true);
    expect(mockClearAppCache).toHaveBeenCalledTimes(1);
    expect(mockSetSentryUser).toHaveBeenCalledWith('user-1');
  });

  it('clears cache and sets unauthorized when user is not on allowlist', async () => {
    const userSession = {
      user: { id: 'user-2', email: 'intruder@example.com' },
    } as unknown as Session;

    mockGetSession = vi.fn().mockResolvedValue({ data: { session: userSession } });
    mockCheckUserAuthorization.mockResolvedValue({ isAuthorized: false, error: 'Unauthorized' });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.isAuthChecking).toBe(false);
    });

    expect(result.current.isAuthorized).toBe(false);
    expect(mockClearAppCache).toHaveBeenCalled();
  });

  it('does not re-enter isAuthChecking on token refresh for the same user', async () => {
    const userSession = {
      user: { id: 'user-1', email: 'alice@example.com' },
    } as unknown as Session;

    mockGetSession = vi.fn().mockResolvedValue({ data: { session: userSession } });
    mockCheckUserAuthorization.mockResolvedValue({ isAuthorized: true });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.isAuthChecking).toBe(false);
    });

    expect(result.current.isAuthorized).toBe(true);
    mockClearAppCache.mockClear();

    // Trigger TOKEN_REFRESHED with same user
    const refreshedSession = {
      ...userSession,
      access_token: 'new-token',
    } as unknown as Session;

    await act(async () => {
      authStateChangeCallback?.('TOKEN_REFRESHED', refreshedSession);
    });

    // isAuthChecking should stay false; cache should not be wiped
    expect(result.current.isAuthChecking).toBe(false);
    expect(mockClearAppCache).not.toHaveBeenCalled();
  });

  it('clears cache and resets state on SIGNED_OUT', async () => {
    const userSession = {
      user: { id: 'user-1', email: 'alice@example.com' },
    } as unknown as Session;

    mockGetSession = vi.fn().mockResolvedValue({ data: { session: userSession } });
    mockCheckUserAuthorization.mockResolvedValue({ isAuthorized: true });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.isAuthorized).toBe(true);
    });

    mockClearAppCache.mockClear();

    await act(async () => {
      authStateChangeCallback?.('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(result.current.session).toBeNull();
      expect(result.current.isAuthorized).toBe(false);
    });

    expect(mockClearAppCache).toHaveBeenCalled();
    expect(mockSetSentryUser).toHaveBeenCalledWith(null);
  });
});
