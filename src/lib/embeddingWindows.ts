export const PROFILE_PREPROCESSING_VERSION = 'profile-token-windows:v2';

export function tokenWindows(tokens: number[], window = 480, overlap = 32): number[][] {
  if (!Number.isSafeInteger(window) || window <= overlap || overlap < 0) throw new Error('Invalid token window');
  if (tokens.length > 30_000) throw new Error('Profile exceeds inference token budget');
  const windows: number[][] = [];
  for (let start = 0; start < tokens.length; start += window - overlap) {
    windows.push(tokens.slice(start, start + window));
    if (start + window >= tokens.length) break;
  }
  return windows;
}

export function poolEmbeddingVectors(vectors: number[][]): number[] {
  if (!vectors.length || vectors.some(vector => vector.length !== 384 || vector.some(value => !Number.isFinite(value)))) {
    throw new Error('Invalid profile embedding windows');
  }
  const mean = Array.from({ length: 384 }, (_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length);
  const magnitude = Math.hypot(...mean);
  if (!magnitude) throw new Error('Empty profile embedding');
  return mean.map(value => value / magnitude);
}
