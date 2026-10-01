import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { AuthorizationResult } from '../components/auth/authConfig';
import { queryClient } from '../lib/queryClient';
import { useAuthSession } from './useAuthSession';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(), check: vi.fn(), unsubscribe: vi.fn(),
  listener: null as null | ((event: string, session: Session | null) => void),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {
  getSession: auth.getSession,
  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
    auth.listener = callback;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  },
} } }));
vi.mock('../lib/localDevAuth', () => ({ isLocalDevelopmentAuthBypass: false }));
vi.mock('../components/auth/authConfig', () => ({ checkUserAuthorization: auth.check }));
const session = (id: string): Session => ({
  access_token: 'synthetic', refresh_token: 'synthetic', expires_in: 3600, token_type: 'bearer',
  user: { id, email: `${id}@example.invalid`, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  auth.listener = null;
  auth.getSession.mockResolvedValue({ data: { session: session('user-a') } });
  auth.check.mockResolvedValue({ isAuthorized: true, role: 'member' });
});
describe('session isolation', () => {
  it('removes private cached data on account changes and logout', async () => {
    const { result } = renderHook(useAuthSession);
    await waitFor(() => expect(result.current.session?.user.id).toBe('user-a'));
    queryClient.setQueryData(['private', 'user-a'], { sensitive: 'synthetic' });
    act(() => auth.listener?.('SIGNED_IN', session('user-b')));
    await waitFor(() => expect(result.current.session?.user.id).toBe('user-b'));
    expect(queryClient.getQueryData(['private', 'user-a'])).toBeUndefined();
    queryClient.setQueryData(['private', 'user-b'], { sensitive: 'synthetic' });
    act(() => auth.listener?.('SIGNED_OUT', null));
    expect(result.current.session).toBeNull();
    expect(queryClient.getQueryData(['private', 'user-b'])).toBeUndefined();
  });
  it('cannot restore an old identity when authorization resolves after logout', async () => {
    const pending = deferred<AuthorizationResult>();
    auth.check.mockReturnValue(pending.promise);
    const { result } = renderHook(useAuthSession);
    await waitFor(() => expect(auth.check).toHaveBeenCalled());
    act(() => auth.listener?.('SIGNED_OUT', null));
    await act(async () => pending.resolve({ isAuthorized: true, role: 'member' }));
    expect(result.current.session).toBeNull();
    expect(result.current.isAuthorized).toBe(false);
  });
  it('does not let a late initial session read replace a newer account', async () => {
    const pending = deferred<{ data: { session: Session } }>();
    auth.getSession.mockReturnValue(pending.promise);
    const { result } = renderHook(useAuthSession);
    act(() => auth.listener?.('SIGNED_IN', session('user-b')));
    await waitFor(() => expect(result.current.session?.user.id).toBe('user-b'));
    await act(async () => pending.resolve({ data: { session: session('user-a') } }));
    expect(result.current.session?.user.id).toBe('user-b');
  });
});
