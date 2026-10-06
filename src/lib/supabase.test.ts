import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

describe('account-bound mutation transport', () => {
  async function setup() {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'synthetic-key');
    mocks.createClient.mockImplementation((_url, _key, options) => options ?? { auth: { getSession: mocks.getSession } });
    return import('./supabase');
  }

  it('retains the initiating token after the global account switches', async () => {
    const { getAccountClient } = await setup();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'token-a' } }, error: null });
    await getAccountClient('a');
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } }, error: null });
    const options = mocks.createClient.mock.calls[1][2];
    expect(await options.accessToken()).toBe('token-a');
  });

  it('rejects a stale initiating identity before creating a transport', async () => {
    const { getAccountClient } = await setup();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } }, error: null });
    await expect(getAccountClient('a')).rejects.toThrow('Active account changed');
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });
});
