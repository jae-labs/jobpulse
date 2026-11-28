import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Same official PostgreSQL 17 image as the pinned local Supabase runtime.
const DUMP_IMAGE = 'public.ecr.aws/supabase/postgres@sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518';

export function credentialFreeDumpScript(script) {
  const exports = script.match(/^export PG(?:HOST|PORT|USER|PASSWORD|DATABASE)=.*$/gm);
  if (!script.startsWith('#!/usr/bin/env bash\nset -euo pipefail') || exports?.length !== 5) {
    throw new Error('Unexpected Supabase dump script; review the CLI upgrade');
  }
  return script.replace(/^export PG(?:HOST|PORT|USER|PASSWORD|DATABASE)=.*\n/gm, '');
}

export function databaseTarget(env) {
  if (!env.SUPABASE_DB_URL) return { args: ['--linked'], env };
  const url = new URL(env.SUPABASE_DB_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.search || url.hash) {
    throw new Error('Use a PostgreSQL URL without query parameters or fragments');
  }
  const password = url.password ? decodeURIComponent(url.password) : env.SUPABASE_DB_PASSWORD;
  url.password = '';
  const safeEnv = { ...env, SUPABASE_DB_PASSWORD: password };
  delete safeEnv.SUPABASE_DB_URL;
  return { args: ['--db-url', url.toString()], env: safeEnv };
}

export function backupDatabase(env = process.env) {
  const target = databaseTarget(env);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const directory = env.BACKUP_DIR || `.backups/jobpulse-${stamp}`;
  process.umask(0o077);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [file, flags] of [['roles.sql', ['--role-only']], ['schema.sql', []], ['data.sql', ['--data-only', '--use-copy']]]) {
    let result;
    if (target.args[0] === '--db-url') {
      // CLI 2.116 does not honor SUPABASE_DB_PASSWORD with an explicit URL.
      // Keep its schema/role filtering, but pass libpq credentials by environment
      // to a pinned container. The CLI script and process arguments stay secret-free.
      const generated = spawnSync('supabase', ['db', 'dump', ...target.args, ...flags, '--dry-run'],
        { env: target.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      if (generated.status !== 0) throw new Error('Could not prepare database backup');
      const script = credentialFreeDumpScript(generated.stdout);
      const url = new URL(target.args[1]);
      const env = { ...target.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
        PGPASSWORD: target.env.SUPABASE_DB_PASSWORD || '' };
      const output = openSync(`${directory}/${file}`, 'wx', 0o600);
      try {
        result = spawnSync('docker', ['run', '--rm', '-i', ...['PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD'].flatMap(key => ['--env', key]),
          DUMP_IMAGE, 'bash', '--noprofile', '--norc', '-s'], { env, input: script, stdio: ['pipe', output, 'inherit'] });
      } finally { closeSync(output); }
    } else {
      result = spawnSync('supabase', ['db', 'dump', ...target.args, ...flags, '-f', `${directory}/${file}`],
        { env: target.env, stdio: 'inherit' });
    }
    if (result.error || result.status !== 0) throw new Error('Database backup failed');
  }
  process.stdout.write(`Database backup completed: ${directory}\nStorage objects require a separate backup.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) backupDatabase();
