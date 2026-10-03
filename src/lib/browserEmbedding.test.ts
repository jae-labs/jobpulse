import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeProfileEmbeddingWorker, embedProfile } from './browserEmbedding';
import { DEFAULT_PROFILE } from './defaultProfile';

class SyntheticWorker {
  static instances: SyntheticWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { SyntheticWorker.instances.push(this); }
  complete() { this.onmessage?.({ data: [1, ...Array(383).fill(0)] } as MessageEvent<unknown>); }
}

describe('profile worker lifecycle', () => {
  afterEach(() => {
    disposeProfileEmbeddingWorker();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    SyntheticWorker.instances = [];
  });
  it('reuses one worker for sequential saves and releases it after the idle bound', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', SyntheticWorker);
    const first = embedProfile(DEFAULT_PROFILE);
    await vi.advanceTimersByTimeAsync(0);
    const worker = SyntheticWorker.instances[0]; worker.complete(); await first;
    const second = embedProfile({ ...DEFAULT_PROFILE, headline: 'Synthetic edit' });
    await vi.advanceTimersByTimeAsync(0);
    expect(SyntheticWorker.instances).toHaveLength(1);
    worker.complete(); await second;
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('rejects in-flight inference when its account cache is disposed', async () => {
    vi.stubGlobal('Worker', SyntheticWorker);
    const inference = embedProfile(DEFAULT_PROFILE);
    const rejection = expect(inference).rejects.toThrow('interrupted');
    await Promise.resolve(); await Promise.resolve();
    disposeProfileEmbeddingWorker();
    await rejection;
    expect(SyntheticWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});
