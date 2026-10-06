import { describe, expect, it } from 'vitest';
import { poolEmbeddingVectors, tokenWindows } from './embeddingWindows';

describe('bounded profile inference', () => {
  it('covers every token including requirements past the first model window', () => {
    const tokens = Array.from({ length: 1_001 }, (_, index) => index);
    const windows = tokenWindows(tokens);
    expect(new Set(windows.flat()).size).toBe(tokens.length);
    expect(windows.every(window => window.length <= 480)).toBe(true);
    expect(windows.at(-1)?.at(-1)).toBe(1_000);
    expect(() => tokenWindows(Array(30_001).fill(1))).toThrow('budget');
  });
  it('a tail-window requirement changes the normalized pooled vector', () => {
    const first = Array(384).fill(0); first[0] = 1;
    const tail = Array(384).fill(0); tail[1] = 1;
    const pooled = poolEmbeddingVectors([first, tail]);
    expect(pooled[1]).toBeGreaterThan(0);
    expect(Math.hypot(...pooled)).toBeCloseTo(1);
    expect(pooled).not.toEqual(first);
    expect(() => poolEmbeddingVectors([Array(384).fill(0)])).toThrow();
  });
});
