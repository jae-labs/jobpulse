import { describe, expect, it } from 'vitest';
import { isModuleLoadError } from './moduleLoadError';

describe('module load error recognition', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/assets/chart.js',
    'error loading dynamically imported module: https://example.com/assets/chart.js',
    'Importing a module script failed.',
    'Loading chunk 123 failed.',
  ])('recognizes browser module failures: %s', (message) => {
    expect(isModuleLoadError(new TypeError(message))).toBe(true);
  });

  it('recognizes named chunk errors', () => {
    const error = new Error('Download failed');
    error.name = 'ChunkLoadError';
    expect(isModuleLoadError(error)).toBe(true);
  });

  it('keeps ordinary rendering and API failures on the existing retry path', () => {
    for (const error of [null, new Error('Failed to fetch'), new Error('Exploded unexpectedly')]) {
      expect(isModuleLoadError(error)).toBe(false);
    }
  });
});
