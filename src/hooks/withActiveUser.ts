import { getCurrentUserId } from '../lib/userSession';

export async function withActiveUser<T>(expected: string | null | undefined, operation: () => Promise<T>): Promise<T> {
  if (!expected || await getCurrentUserId() !== expected) throw new Error('Active account changed');
  const result = await operation();
  if (await getCurrentUserId() !== expected) throw new Error('Active account changed');
  return result;
}
