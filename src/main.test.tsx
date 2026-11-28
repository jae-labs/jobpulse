import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrap = vi.hoisted(() => ({ order: [] as string[], render: vi.fn(), initSentry: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: bootstrap.render }) }));
vi.mock('./App.tsx', () => ({ default: () => null }));
vi.mock('./lib/i18n', () => ({}));
vi.mock('./lib/invitationContext', () => ({ consumeInvitationParameters: () => bootstrap.order.push('invitation') }));
vi.mock('./lib/logger', () => ({ initGlobalErrorLogging: vi.fn(), warn: vi.fn() }));
vi.mock('./lib/sentry', () => ({ initSentry: () => {
  bootstrap.order.push('telemetry');
  bootstrap.initSentry();
} }));

describe('optional telemetry bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    bootstrap.order.length = 0;
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([[false, 'https://example.invalid'], [true, '']])(
    'does not initialize telemetry when production=%s or DSN is absent', async (production, dsn) => {
      vi.stubEnv('PROD', production);
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      await import('./main');
      expect(bootstrap.initSentry).not.toHaveBeenCalled();
      expect(bootstrap.render).toHaveBeenCalledOnce();
    },
  );

  it('consumes invitation parameters before loading enabled telemetry', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid');
    await import('./main');
    await vi.waitFor(() => expect(bootstrap.initSentry).toHaveBeenCalledOnce());
    expect(bootstrap.order).toEqual(['invitation', 'telemetry']);
  });
});
