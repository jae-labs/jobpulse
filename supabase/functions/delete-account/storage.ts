export interface StorageEntry {
  name: string;
  id: string | null;
}

export interface BucketOperations {
  list(path: string, options: { limit: number; offset: number }): Promise<{
    data: StorageEntry[] | null;
    error: { message: string } | null;
  }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

const PAGE_SIZE = 100;

async function listFiles(bucket: BucketOperations, folder: string): Promise<string[]> {
  const files: string[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(folder, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Could not list account files: ${error.message}`);

    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) {
        files.push(...await listFiles(bucket, path));
      } else {
        files.push(path);
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return files;
}

/** Remove bytes through the Storage API before the Auth user is deleted. */
export async function removeAccountFiles(
  bucket: BucketOperations,
  userId: string,
  additionalPaths: string[] = [],
): Promise<void> {
  // A second pass catches files created while the first pass was running.
  for (let pass = 0; pass < 3; pass += 1) {
    const paths = new Set(await listFiles(bucket, userId));
    // Document metadata is writable by the account owner. Never let a forged
    // metadata path make this privileged function delete another user's file.
    if (pass === 0) additionalPaths
      .filter((path) => path.startsWith(`${userId}/`))
      .forEach((path) => paths.add(path));
    if (paths.size === 0) return;

    const files = [...paths];
    for (let start = 0; start < files.length; start += 1000) {
      const { error } = await bucket.remove(files.slice(start, start + 1000));
      if (error) throw new Error(`Could not remove account files: ${error.message}`);
    }
  }

  if ((await listFiles(bucket, userId)).length > 0) {
    throw new Error('Account files are still being uploaded. Try again.');
  }
}
