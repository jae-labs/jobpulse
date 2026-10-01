import { describe, expect, it, vi } from 'vitest';
import { removeAccountFiles, type BucketOperations, type StorageEntry } from './storage';

describe('removeAccountFiles', () => {
  it('deletes nested paginated files and metadata paths without touching another user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const paths = new Set([
      ...Array.from({ length: 105 }, (_, index) => `${userId}/cv/resume-${index}.pdf`),
      'legacy-owner/document.pdf',
      '22222222-2222-2222-2222-222222222222/avatar',
    ]);

    const list = vi.fn(async (folder: string, { limit, offset }: { limit: number; offset: number }) => {
      const children = new Map<string, StorageEntry>();
      for (const path of paths) {
        if (!path.startsWith(`${folder}/`)) continue;
        const child = path.slice(folder.length + 1).split('/')[0];
        children.set(child, {
          name: child,
          id: path === `${folder}/${child}` ? child : null,
        });
      }
      return { data: [...children.values()].slice(offset, offset + limit), error: null };
    });
    const remove = vi.fn(async (batch: string[]) => {
      batch.forEach((path) => paths.delete(path));
      return { error: null };
    });

    await removeAccountFiles({ list, remove } satisfies BucketOperations, userId, [
      `${userId}/cv/resume-0.pdf`,
      'legacy-owner/document.pdf',
      '22222222-2222-2222-2222-222222222222/avatar',
    ]);

    expect([...paths]).toEqual(['legacy-owner/document.pdf', '22222222-2222-2222-2222-222222222222/avatar']);
    expect(list).toHaveBeenCalledWith(`${userId}/cv`, { limit: 100, offset: 100 });
    expect(remove).toHaveBeenCalled();
  });

  it('stops when Storage reports a deletion failure', async () => {
    const bucket: BucketOperations = {
      list: async () => ({ data: [{ name: 'avatar', id: 'file' }], error: null }),
      remove: async () => ({ error: { message: 'Storage unavailable' } }),
    };

    await expect(removeAccountFiles(bucket, '11111111-1111-1111-1111-111111111111'))
      .rejects.toThrow('Could not remove account files');
  });
});
