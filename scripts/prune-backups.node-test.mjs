import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  utimes,
  symlink,
  rm,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pruneBackups } from "./prune-backups.mjs";
test("retention removes only old completed snapshots and never follows links", async () => {
  const root = await mkdtemp(join(tmpdir(), "jobpulse-retention-"));
  try {
    for (const name of [
      "jobpulse-old",
      "jobpulse-current",
      "jobpulse-incomplete",
      "unrelated",
    ])
      await mkdir(join(root, name));
    for (const name of ["jobpulse-old", "jobpulse-current", "unrelated"])
      await writeFile(join(root, name, ".complete"), "");
    const old = new Date(Date.now() - 366 * 86400000);
    for (const name of ["jobpulse-old", "unrelated"])
      await utimes(join(root, name, ".complete"), old, old);
    await symlink(join(root, "unrelated"), join(root, "jobpulse-link"));
    assert.equal(await pruneBackups(root), 1);
    await assert.rejects(access(join(root, "jobpulse-old")));
    for (const name of [
      "jobpulse-current",
      "jobpulse-incomplete",
      "unrelated",
      "jobpulse-link",
    ])
      await access(join(root, name));
    await assert.rejects(pruneBackups(join(root, "jobpulse-link")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
