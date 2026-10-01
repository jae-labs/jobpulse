/** One-year maximum for completed local production snapshots. No remote data is modified. */
import { lstat, readdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function pruneBackups(directory, now = Date.now()) {
  let root;
  try {
    root = await lstat(directory);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new Error("Backup root must be a real directory");
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !/^jobpulse-[\w-]+$/.test(entry.name)
    )
      continue;
    const target = join(directory, entry.name);
    let marker;
    try {
      marker = await lstat(join(target, ".complete"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (
      !marker.isFile() ||
      marker.isSymbolicLink() ||
      now - marker.mtimeMs <= 365 * 24 * 60 * 60 * 1000
    )
      continue;
    await rm(target, { recursive: true, force: false });
    removed++;
  }
  return removed;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const removed = await pruneBackups(
    resolve(import.meta.dirname, "../.backups"),
  );
  console.log(`Expired completed backups removed: ${removed}`);
}
