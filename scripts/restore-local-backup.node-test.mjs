import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'jobpulse-restore-guard-'));
  for (const path of ['scripts', 'supabase', '.backups/synthetic', 'bin']) mkdirSync(`${root}/${path}`, { recursive: true });
  copyFileSync(new URL('./restore-local-backup.sh', import.meta.url), `${root}/scripts/restore-local-backup.sh`);
  writeFileSync(`${root}/supabase/config.toml`, 'project_id = "restore-guard"\n');
  const backup = `${root}/.backups/synthetic`;
  const data = 'COPY "public"."jobs" ("id") FROM stdin;\n\\.\n';
  writeFileSync(`${backup}/data.sql`, data);
  writeFileSync(`${backup}/.complete`, '');
  writeFileSync(`${backup}/SHA256SUMS`, `${createHash('sha256').update(data).digest('hex')}  data.sql\n`);
  writeFileSync(`${root}/bin/supabase`, `#!/bin/sh\ntouch '${root}/reset-called'\n`, { mode: 0o700 });
  return { root, backup, run: env => spawnSync('bash', [`${root}/scripts/restore-local-backup.sh`, backup], {
    cwd: tmpdir(), env: { ...process.env, ...env, PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8',
  }) };
}

test('missing Storage export is rejected before any reset', () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /include Storage/);
    assert.equal(existsSync(`${f.root}/reset-called`), false);
  } finally { rmSync(f.root, { recursive: true }); }
});
test('remote Docker targets are rejected before any reset', () => {
  const f = fixture();
  try {
    mkdirSync(`${f.backup}/storage`);
    writeFileSync(`${f.root}/bin/docker`, '#!/bin/sh\necho tcp://remote.invalid:2375\n', { mode: 0o700 });
    const result = f.run({ DOCKER_HOST: 'tcp://remote.invalid:2375' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /local Docker socket/);
    assert.equal(existsSync(`${f.root}/reset-called`), false);
  } finally { rmSync(f.root, { recursive: true }); }
});
test('symbolic links in recovery data are rejected before any reset', () => {
  const f = fixture();
  try {
    mkdirSync(`${f.backup}/storage`);
    symlinkSync(`${f.backup}/data.sql`, `${f.backup}/linked.sql`);
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symbolic links/);
    assert.equal(existsSync(`${f.root}/reset-called`), false);
  } finally { rmSync(f.root, { recursive: true }); }
});
test('restore binds the repository and adds only the developer account, preserving catalog data', () => {
  const f = fixture();
  try {
    mkdirSync(`${f.backup}/storage`);
    writeFileSync(`${f.root}/bin/docker`, `#!/bin/sh\ncase "$1" in\n context) echo unix:///synthetic.sock ;;\n exec) cat >> '${f.root}/restored-sql' ;;\n container) exit 0 ;;\nesac\n`, { mode: 0o700 });
    writeFileSync(`${f.root}/bin/supabase`, `#!/bin/sh\npwd > '${f.root}/cli-cwd'\nprintf '%s\\n' "$@" > '${f.root}/cli-args'\n`, { mode: 0o700 });
    writeFileSync(`${f.root}/supabase/local-dev-account.sql`, '-- DEVELOPER_ACCOUNT_ONLY\n');
    writeFileSync(`${f.root}/supabase/seed.sql`, '-- FULL_CATALOG_MUST_NOT_RUN\n');
    writeFileSync(`${f.root}/scripts/import-storage.sh`, '#!/bin/sh\nexit 0\n');
    const result = f.run({ DOCKER_HOST: 'unix:///synthetic.sock' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(`${f.root}/cli-cwd`, 'utf8').trim(), f.root);
    assert.match(readFileSync(`${f.root}/cli-args`, 'utf8'), new RegExp(`--workdir\\n${f.root}\\ndb\\nreset\\n--local`));
    const sql = readFileSync(`${f.root}/restored-sql`, 'utf8');
    assert.match(sql, /TRUNCATE TABLE "public"\."jobs"/);
    assert.match(sql, /DEVELOPER_ACCOUNT_ONLY/);
    assert.doesNotMatch(sql, /FULL_CATALOG_MUST_NOT_RUN/);
  } finally { rmSync(f.root, { recursive: true }); }
});
